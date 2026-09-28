import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import type { Readable, Writable } from 'node:stream';
import {
  commandExists,
  createSystemCommandProbe,
  type CommandProbe,
} from './system.js';

export type SupportedUbuntuVersion = '20.04' | '22.04';

export type SupportedNativeOs =
  | {
      platform: 'linux';
      ubuntuVersion: SupportedUbuntuVersion;
    }
  | {
      platform: 'macos';
    };

export type ManagedPrerequisiteId =
  | 'rust'
  | 'cargo'
  | 'cmake'
  | 'toolchain'
  | 'llvm-toolchain'
  | 'git'
  | 'ninja'
  | 'pkg-config'
  | 'tar'
  | 'unzip';

export interface PrerequisiteStatus {
  compatible: boolean;
  commands: readonly string[];
  id: ManagedPrerequisiteId;
  installed: boolean;
  label: string;
  requirement: string;
  version: string | null;
}

export type PrerequisiteInstallationAction =
  | {
      kind: 'apt';
      packages: readonly string[];
    }
  | {
      kind: 'kitware-cmake-source';
    }
  | {
      kind: 'llvm-apt';
      ubuntuVersion: SupportedUbuntuVersion;
    }
  | {
      kind: 'brew';
      formulas: readonly string[];
    }
  | {
      kind: 'homebrew';
    }
  | {
      kind: 'rustup';
    }
  | {
      kind: 'xcode-command-line-tools';
    };

export interface PrerequisiteInstallationPlan {
  actions: readonly PrerequisiteInstallationAction[];
  os: SupportedNativeOs;
  statuses: readonly PrerequisiteStatus[];
}

export interface PrerequisiteInstallExecutionOptions {
  verbose: boolean;
}

export type PrerequisiteInstallExecutionResult = 'complete' | 'rerun-required';

const MINIMUM_RUST_VERSION = '1.85.0';
const MINIMUM_CMAKE_VERSION = '3.18.0';
const ICICLE_CMAKE_VERSION = '3.27.4';
const UBUNTU_PACKAGE_ORDER: Record<SupportedUbuntuVersion, readonly string[]> = {
  '20.04': [
    'build-essential',
    'wget',
    'tar',
    'libssl-dev',
    'libcurl4-openssl-dev',
    'libarchive-dev',
    'zlib1g-dev',
    'ninja-build',
    'software-properties-common',
    'gnupg',
    'git',
    'pkg-config',
    'unzip',
  ],
  '22.04': [
    'build-essential',
    'cmake',
    'tar',
    'ninja-build',
    'software-properties-common',
    'wget',
    'gnupg',
    'git',
    'pkg-config',
    'unzip',
  ],
};

interface CmakeManifest {
  minimumCompatibleVersion: string;
  sha256: string;
  url: string;
  version: string;
}

export interface OsRelease {
  [key: string]: string;
}

function extractNumericVersion(output: string | null): string | null {
  const match = output === null ? null : /(?:^|\D)(\d+\.\d+(?:\.\d+)?)(?:\D|$)/u.exec(output);
  return match === null ? null : match[1];
}

function versionParts(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?$/u.exec(version);
  return match === null
    ? null
    : [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

export function versionMeetsMinimum(version: string | null, minimumVersion: string): boolean {
  const actual = version === null ? null : versionParts(version);
  const minimum = versionParts(minimumVersion);
  if (actual === null || minimum === null) {
    return false;
  }
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== minimum[index]) {
      return actual[index] > minimum[index];
    }
  }
  return true;
}

function unquoteOsReleaseValue(value: string): string {
  const quote = value[0];
  if ((quote !== '"' && quote !== "'") || value[value.length - 1] !== quote) {
    return value;
  }

  const unquoted = value.slice(1, -1);
  if (quote === "'") {
    return unquoted;
  }
  return unquoted.replace(/\\(["\\$`])/gu, '$1');
}

export function parseOsRelease(contents: string): OsRelease {
  const values: OsRelease = {};
  for (const line of contents.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }
    const match = /^([A-Z0-9_]+)=(.*)$/u.exec(trimmed);
    if (match === null) {
      continue;
    }
    values[match[1]] = unquoteOsReleaseValue(match[2].trim());
  }
  return values;
}

export function parseSupportedUbuntuRelease(contents: string): SupportedUbuntuVersion {
  const release = parseOsRelease(contents);
  if (release.ID !== 'ubuntu') {
    throw new Error(
      `Unsupported Linux distribution: expected Ubuntu 20.04 or 22.04, found ${release.ID ?? 'an unknown distribution'}.`,
    );
  }
  if (release.VERSION_ID !== '20.04' && release.VERSION_ID !== '22.04') {
    throw new Error(
      `Unsupported Ubuntu version: expected 20.04 or 22.04, found ${release.VERSION_ID ?? 'an unknown version'}.`,
    );
  }
  return release.VERSION_ID;
}

export async function detectSupportedNativeOs(
  platform: NodeJS.Platform = process.platform,
  readOsRelease: () => Promise<string> = async () => await fs.readFile('/etc/os-release', 'utf8'),
): Promise<SupportedNativeOs> {
  if (platform === 'darwin') {
    return { platform: 'macos' };
  }
  if (platform !== 'linux') {
    throw new Error(
      `Unsupported platform: ${platform}. Native tokamak-cli installs support macOS, Ubuntu 20.04, and Ubuntu 22.04.`,
    );
  }

  let contents: string;
  try {
    contents = await readOsRelease();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to identify the Linux distribution from /etc/os-release: ${message}`);
  }
  return {
    platform: 'linux',
    ubuntuVersion: parseSupportedUbuntuRelease(contents),
  };
}

function logInstallProgress(message: string): void {
  console.error(`[prerequisite] ${message}`);
}

async function runInteractiveCommand(
  command: string,
  args: readonly string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    verbose: boolean;
  },
): Promise<void> {
  if (options.verbose) {
    logInstallProgress(`Running: ${command} ${args.join(' ')}`);
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const termination = signal === null ? `code ${code ?? 'unknown'}` : `signal ${signal}`;
      reject(new Error(`${command} exited with ${termination}.`));
    });
  });
}

async function withDownloadedFile(
  url: string,
  prefix: string,
  filename: string,
  run: (downloadPath: string, tempDir: string) => Promise<void>,
  expectedSha256?: string,
): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  const downloadPath = path.join(tempDir, filename);
  try {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
    }
    const contents = new Uint8Array(await response.arrayBuffer());
    if (expectedSha256 !== undefined) {
      const actualSha256 = createHash('sha256').update(contents).digest('hex');
      if (actualSha256 !== expectedSha256) {
        throw new Error(
          `Downloaded file from ${url} has SHA-256 ${actualSha256}, expected ${expectedSha256}.`,
        );
      }
    }
    await fs.writeFile(downloadPath, contents, {
      mode: 0o700,
    });
    await run(downloadPath, tempDir);
  } finally {
    await fs.rm(tempDir, { force: true, recursive: true });
  }
}

export function prependPathValue(currentPath: string | undefined, entry: string): string {
  const entries = (currentPath ?? '').split(path.delimiter);
  if (!entries.includes(entry)) {
    return [entry, ...entries].filter((value) => value.length > 0).join(path.delimiter);
  }
  return currentPath ?? '';
}

function prependPath(entry: string): void {
  process.env.PATH = prependPathValue(process.env.PATH, entry);
}

export function activateManagedPrerequisiteEnvironment(
  platform: NodeJS.Platform = process.platform,
  homeDirectory: string = os.homedir(),
  brewExecutable: string | null = platform === 'darwin' ? resolveBrewExecutable() : null,
): void {
  prependPath(path.join(homeDirectory, '.local', 'bin'));
  prependPath(path.join(homeDirectory, '.cargo', 'bin'));
  if (brewExecutable !== null) {
    refreshHomebrewEnvironment(brewExecutable);
  }
}

async function installRustup(options: PrerequisiteInstallExecutionOptions): Promise<void> {
  logInstallProgress('Installing the latest stable Rust toolchain with rustup.');
  const cargoHome = path.join(os.homedir(), '.cargo');
  const rustupHome = path.join(os.homedir(), '.rustup');
  const rustEnvironment = {
    ...process.env,
    CARGO_HOME: cargoHome,
    RUSTUP_HOME: rustupHome,
  };
  const commandOptions = {
    ...options,
    env: rustEnvironment,
  };
  const probe = createSystemCommandProbe(rustEnvironment);
  if (probe.exists('rustup')) {
    await runInteractiveCommand('rustup', ['toolchain', 'install', 'stable'], commandOptions);
    await runInteractiveCommand('rustup', ['default', 'stable'], commandOptions);
  } else {
    await withDownloadedFile(
      'https://sh.rustup.rs',
      'tokamak-rustup',
      'install.sh',
      async (installerPath) => {
        await runInteractiveCommand(
          '/bin/sh',
          [installerPath, '-y', '--default-toolchain', 'stable'],
          commandOptions,
        );
      },
    );
  }
  process.env.CARGO_HOME = cargoHome;
  process.env.RUSTUP_HOME = rustupHome;
  prependPath(path.join(cargoHome, 'bin'));
}

async function installAptPackages(
  packages: readonly string[],
  options: PrerequisiteInstallExecutionOptions,
): Promise<void> {
  const probe = createSystemCommandProbe();
  if (!probe.exists('sudo')) {
    throw new Error('sudo is required to install Ubuntu packages, but it is not available on PATH.');
  }
  if (!probe.exists('apt-get')) {
    throw new Error('apt-get is required to install prerequisites on Ubuntu, but it is not available on PATH.');
  }
  logInstallProgress(`Installing Ubuntu packages: ${packages.join(', ')}.`);
  await runInteractiveCommand('sudo', ['apt-get', 'update'], options);
  await runInteractiveCommand('sudo', ['apt-get', 'install', '-y', ...packages], options);
}

async function loadCmakeManifest(): Promise<CmakeManifest> {
  const manifestPath = path.resolve(__dirname, '..', 'manifests', 'cmake-v3.27.4.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Partial<CmakeManifest>;
  if (
    manifest.version !== ICICLE_CMAKE_VERSION
    || manifest.minimumCompatibleVersion !== MINIMUM_CMAKE_VERSION
    || typeof manifest.url !== 'string'
    || manifest.url
      !== `https://github.com/Kitware/CMake/releases/download/v${ICICLE_CMAKE_VERSION}/cmake-${ICICLE_CMAKE_VERSION}.tar.gz`
    || typeof manifest.sha256 !== 'string'
    || !/^[a-f0-9]{64}$/u.test(manifest.sha256)
  ) {
    throw new Error(`Invalid CMake prerequisite manifest: ${manifestPath}.`);
  }
  return manifest as CmakeManifest;
}

async function installKitwareCmakeSource(
  options: PrerequisiteInstallExecutionOptions,
): Promise<void> {
  const manifest = await loadCmakeManifest();
  logInstallProgress(
    `Building Kitware CMake ${manifest.version} from source for /usr/local.`,
  );
  await withDownloadedFile(
    manifest.url,
    'tokamak-cmake',
    `cmake-${manifest.version}.tar.gz`,
    async (archivePath, tempDir) => {
      await runInteractiveCommand('tar', ['-xzf', archivePath, '-C', tempDir], options);
      const sourceDir = path.join(tempDir, `cmake-${manifest.version}`);
      await runInteractiveCommand(
        './bootstrap',
        [],
        { ...options, cwd: sourceDir },
      );
      await runInteractiveCommand(
        'make',
        [`-j${Math.max(1, os.cpus().length)}`],
        { ...options, cwd: sourceDir },
      );
      await runInteractiveCommand(
        'sudo',
        ['make', 'install'],
        { ...options, cwd: sourceDir },
      );
    },
    manifest.sha256,
  );
}

async function installLlvmAptRepository(
  ubuntuVersion: SupportedUbuntuVersion,
  options: PrerequisiteInstallExecutionOptions,
): Promise<void> {
  const codename = ubuntuVersion === '20.04' ? 'focal' : 'jammy';
  const repository = `deb http://apt.llvm.org/${codename}/ llvm-toolchain-${codename} main`;
  logInstallProgress(`Adding the LLVM APT repository selected by ICICLE for ${codename}.`);
  await runInteractiveCommand(
    'sudo',
    [
      '/bin/sh',
      '-c',
      'wget -O - https://apt.llvm.org/llvm-snapshot.gpg.key | apt-key add -',
    ],
    options,
  );
  await runInteractiveCommand(
    'sudo',
    ['add-apt-repository', '-y', repository],
    options,
  );
  await installAptPackages(['clang', 'lldb', 'lld'], options);
}

function resolveBrewExecutable(): string | null {
  const candidates = [
    '/opt/homebrew/bin/brew',
    '/usr/local/bin/brew',
    '/home/linuxbrew/.linuxbrew/bin/brew',
  ];
  for (const candidate of candidates) {
    if (commandExists(candidate)) {
      return candidate;
    }
  }
  return createSystemCommandProbe().exists('brew') ? 'brew' : null;
}

function refreshHomebrewEnvironment(brewExecutable: string): void {
  const result = spawnSync(
    '/bin/sh',
    ['-c', 'eval "$("$1" shellenv)"; env -0', 'tokamak-homebrew-shellenv', brewExecutable],
    {
      encoding: 'buffer',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Unable to load Homebrew shell environment: ${result.stderr.toString('utf8').trim()}`,
    );
  }

  const allowedVariables = new Set([
    'HOMEBREW_CELLAR',
    'HOMEBREW_PREFIX',
    'HOMEBREW_REPOSITORY',
    'INFOPATH',
    'MANPATH',
    'PATH',
  ]);
  for (const entry of result.stdout.toString('utf8').split('\0')) {
    const separator = entry.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const name = entry.slice(0, separator);
    if (allowedVariables.has(name)) {
      process.env[name] = entry.slice(separator + 1);
    }
  }
}

async function installHomebrew(options: PrerequisiteInstallExecutionOptions): Promise<void> {
  logInstallProgress('Installing Homebrew with the official upstream installer.');
  await withDownloadedFile(
    'https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh',
    'tokamak-homebrew',
    'install.sh',
    async (installerPath) => {
      await runInteractiveCommand('/bin/bash', [installerPath], options);
    },
  );
  const brewExecutable = resolveBrewExecutable();
  if (brewExecutable === null) {
    throw new Error('Homebrew installation completed, but brew could not be found.');
  }
  refreshHomebrewEnvironment(brewExecutable);
}

function brewFormulaPrefix(brewExecutable: string, formula: string): string {
  const result = spawnSync(brewExecutable, ['--prefix', formula], {
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Unable to resolve the Homebrew prefix for ${formula}: ${result.stderr.trim()}`,
    );
  }
  return result.stdout.trim();
}

async function installBrewFormulas(
  formulas: readonly string[],
  options: PrerequisiteInstallExecutionOptions,
): Promise<void> {
  const brewExecutable = resolveBrewExecutable();
  if (brewExecutable === null) {
    throw new Error('Homebrew is required to install the missing macOS prerequisites.');
  }
  refreshHomebrewEnvironment(brewExecutable);
  for (const formula of formulas) {
    const installed = spawnSync(brewExecutable, ['list', '--versions', formula], {
      env: process.env,
      stdio: 'ignore',
    }).status === 0;
    const operation = installed ? 'upgrade' : 'install';
    logInstallProgress(`${operation === 'install' ? 'Installing' : 'Upgrading'} Homebrew formula: ${formula}.`);
    await runInteractiveCommand(brewExecutable, [operation, formula], options);
  }

  if (formulas.includes('gnu-tar')) {
    prependPath(path.join(brewFormulaPrefix(brewExecutable, 'gnu-tar'), 'libexec', 'gnubin'));
  }
  if (formulas.includes('unzip')) {
    prependPath(path.join(brewFormulaPrefix(brewExecutable, 'unzip'), 'bin'));
  }
}

export async function executePrerequisiteInstallationPlan(
  plan: PrerequisiteInstallationPlan,
  options: PrerequisiteInstallExecutionOptions,
): Promise<PrerequisiteInstallExecutionResult> {
  for (const action of plan.actions) {
    switch (action.kind) {
      case 'apt':
        await installAptPackages(action.packages, options);
        break;
      case 'kitware-cmake-source':
        await installKitwareCmakeSource(options);
        break;
      case 'llvm-apt':
        await installLlvmAptRepository(action.ubuntuVersion, options);
        break;
      case 'brew':
        await installBrewFormulas(action.formulas, options);
        break;
      case 'homebrew':
        await installHomebrew(options);
        break;
      case 'rustup':
        await installRustup(options);
        break;
      case 'xcode-command-line-tools':
        logInstallProgress('Launching Apple\'s Command Line Tools installer.');
        await runInteractiveCommand('xcode-select', ['--install'], options);
        return 'rerun-required';
    }
  }
  return 'complete';
}

interface PrerequisiteDefinition {
  appliesTo?: (os: SupportedNativeOs) => boolean;
  commands: (os: SupportedNativeOs) => readonly string[];
  id: ManagedPrerequisiteId;
  label: string;
  minimumVersion?: string;
  versionArgs: readonly string[];
  verifyAllCommandVersions?: boolean;
}

const PREREQUISITE_DEFINITIONS: readonly PrerequisiteDefinition[] = [
  {
    id: 'rust',
    label: 'Rust',
    commands: () => ['rustc'],
    minimumVersion: MINIMUM_RUST_VERSION,
    versionArgs: ['--version'],
  },
  {
    id: 'cargo',
    label: 'Cargo',
    commands: () => ['cargo'],
    minimumVersion: MINIMUM_RUST_VERSION,
    versionArgs: ['--version'],
  },
  {
    id: 'cmake',
    label: 'CMake',
    commands: () => ['cmake'],
    minimumVersion: MINIMUM_CMAKE_VERSION,
    versionArgs: ['--version'],
  },
  {
    id: 'toolchain',
    label: 'C/C++ toolchain',
    commands: (os) =>
      os.platform === 'macos' ? ['cc', 'c++', 'install_name_tool'] : ['cc', 'c++', 'make'],
    versionArgs: ['--version'],
  },
  {
    appliesTo: (os) => os.platform === 'linux',
    id: 'llvm-toolchain',
    label: 'LLVM toolchain',
    commands: () => ['clang', 'lldb', 'ld.lld'],
    versionArgs: ['--version'],
    verifyAllCommandVersions: true,
  },
  {
    appliesTo: (os) => os.platform === 'linux',
    id: 'git',
    label: 'Git',
    commands: () => ['git'],
    versionArgs: ['--version'],
  },
  {
    appliesTo: (os) => os.platform === 'linux',
    id: 'ninja',
    label: 'Ninja',
    commands: () => ['ninja'],
    versionArgs: ['--version'],
  },
  {
    id: 'pkg-config',
    label: 'pkg-config',
    commands: () => ['pkg-config'],
    versionArgs: ['--version'],
  },
  {
    id: 'tar',
    label: 'tar',
    commands: () => ['tar'],
    versionArgs: ['--version'],
  },
  {
    id: 'unzip',
    label: 'unzip',
    commands: () => ['unzip'],
    versionArgs: ['-v'],
  },
];

export function detectManagedPrerequisites(
  os: SupportedNativeOs,
  probe: CommandProbe = createSystemCommandProbe(),
): PrerequisiteStatus[] {
  return PREREQUISITE_DEFINITIONS
    .filter((definition) => definition.appliesTo?.(os) ?? true)
    .map((definition) => {
      const commands = definition.commands(os);
      const commandsPresent = commands.every((command) => probe.exists(command));
      const versionOutputs = commandsPresent
        ? (definition.verifyAllCommandVersions ? commands : [commands[0]])
          .map((command) => probe.version(command, definition.versionArgs))
        : [];
      const version = versionOutputs.length > 0 && versionOutputs.every((output) => output !== null)
        ? versionOutputs.join('; ')
        : null;
      const requirement = definition.minimumVersion === undefined
        ? 'an installed command with verifiable version output'
        : `version ${definition.minimumVersion} or newer`;
      return {
        compatible: commandsPresent
          && version !== null
          && (
            definition.minimumVersion === undefined
            || versionMeetsMinimum(extractNumericVersion(version), definition.minimumVersion)
          ),
        commands,
        id: definition.id,
        installed: commandsPresent,
        label: definition.label,
        requirement,
        version,
      };
    });
}

/**
 * Returns the managed prerequisite set required by a native backend install.
 * Drive provisions individual files, so neither installation mode needs unzip.
 */
export function detectNativeInstallPrerequisites(
  os: SupportedNativeOs,
  probe: CommandProbe = createSystemCommandProbe(),
): PrerequisiteStatus[] {
  return detectManagedPrerequisites(os, probe)
    .filter((status) => status.id !== 'unzip');
}

export function prerequisiteVerificationFailures(
  statuses: readonly PrerequisiteStatus[],
): string[] {
  return statuses.flatMap((status) => {
    if (!status.installed) {
      return [`${status.label}: required command(s) not found: ${status.commands.join(', ')}`];
    }
    if (status.version === null) {
      return [`${status.label}: installed commands were found, but version verification failed`];
    }
    if (!status.compatible) {
      return [`${status.label}: ${status.version} does not satisfy ${status.requirement}`];
    }
    return [];
  });
}

function installationTargetIds(statuses: readonly PrerequisiteStatus[]): Set<ManagedPrerequisiteId> {
  return new Set(
    statuses
      .filter((status) => !status.compatible)
      .map((status) => status.id),
  );
}

export function buildPrerequisiteInstallationPlan(
  os: SupportedNativeOs,
  statuses: readonly PrerequisiteStatus[],
  homebrewInstalled = false,
): PrerequisiteInstallationPlan {
  const targets = installationTargetIds(statuses);
  const actions: PrerequisiteInstallationAction[] = [];

  if (os.platform === 'linux') {
    const packages = new Set<string>();
    if (targets.has('toolchain')) packages.add('build-essential');
    if (targets.has('git')) packages.add('git');
    if (targets.has('ninja')) packages.add('ninja-build');
    if (targets.has('pkg-config')) packages.add('pkg-config');
    if (targets.has('tar')) packages.add('tar');
    if (targets.has('unzip')) packages.add('unzip');
    if (targets.has('llvm-toolchain')) {
      packages.add('software-properties-common');
      packages.add('wget');
      packages.add('gnupg');
    }
    if (targets.has('cmake')) {
      if (os.ubuntuVersion === '22.04') {
        packages.add('cmake');
      } else {
        for (const packageName of [
          'build-essential',
          'wget',
          'tar',
          'libssl-dev',
          'libcurl4-openssl-dev',
          'libarchive-dev',
          'zlib1g-dev',
          'ninja-build',
          'software-properties-common',
          'gnupg',
        ]) {
          packages.add(packageName);
        }
      }
    }
    if (packages.size > 0) {
      actions.push({
        kind: 'apt',
        packages: UBUNTU_PACKAGE_ORDER[os.ubuntuVersion]
          .filter((packageName) => packages.has(packageName)),
      });
    }
    if (targets.has('llvm-toolchain')) {
      actions.push({ kind: 'llvm-apt', ubuntuVersion: os.ubuntuVersion });
    }
    if (targets.has('cmake') && os.ubuntuVersion === '20.04') {
      actions.push({ kind: 'kitware-cmake-source' });
    }
  } else {
    if (targets.has('toolchain')) {
      actions.push({ kind: 'xcode-command-line-tools' });
    }

    const formulas: string[] = [];
    if (targets.has('cmake')) formulas.push('cmake');
    if (targets.has('pkg-config')) formulas.push('pkg-config');
    if (targets.has('tar')) formulas.push('gnu-tar');
    if (targets.has('unzip')) formulas.push('unzip');
    if (formulas.length > 0) {
      if (!homebrewInstalled) {
        actions.push({ kind: 'homebrew' });
      }
      actions.push({ kind: 'brew', formulas });
    }
  }

  if (targets.has('rust') || targets.has('cargo')) {
    actions.push({ kind: 'rustup' });
  }

  return { actions, os, statuses };
}

function actionDescription(action: PrerequisiteInstallationAction): string {
  switch (action.kind) {
    case 'apt':
      return [
        '`sudo apt-get update`',
        `\`sudo apt-get install -y ${action.packages.join(' ')}\``,
      ].join('\n      ');
    case 'kitware-cmake-source':
      return [
        `Download ICICLE's CMake ${ICICLE_CMAKE_VERSION} source release.`,
        'Verify its SHA-256 checksum, build it, and run `sudo make install` for `/usr/local`.',
      ].join('\n      ');
    case 'llvm-apt': {
      const codename = action.ubuntuVersion === '20.04' ? 'focal' : 'jammy';
      return [
        `Add the apt.llvm.org repository selected by ICICLE for ${codename}.`,
        '`sudo apt-get install -y clang lldb lld`',
      ].join('\n      ');
    }
    case 'brew':
      return `Install or upgrade as needed with Homebrew: ${action.formulas.join(', ')}.`;
    case 'homebrew':
      return 'Download and run the official Homebrew installer from brew.sh.';
    case 'rustup':
      return [
        'Install the latest stable Rust toolchain with the official rustup installer.',
        'Use the standard ~/.rustup and ~/.cargo directories.',
      ].join('\n      ');
    case 'xcode-command-line-tools':
      return [
        'Launch Apple\'s Command Line Tools installer with `xcode-select --install`.',
        'The CLI will stop after launching it; rerun the install after Apple\'s installer finishes.',
      ].join('\n      ');
  }
}

function osDescription(os: SupportedNativeOs): string {
  return os.platform === 'macos' ? 'macOS' : `Ubuntu ${os.ubuntuVersion}`;
}

export function renderPrerequisiteInstallationPlan(plan: PrerequisiteInstallationPlan): string {
  const lines = [
    'Prerequisite installation plan',
    `  Operating system: ${osDescription(plan.os)}`,
    '',
    '  Detection results:',
  ];
  for (const status of plan.statuses) {
    let detail: string;
    if (!status.installed) {
      detail = `missing (${status.commands.join(', ')}); requires ${status.requirement}`;
    } else if (status.version === null) {
      detail = `present, but version verification failed; requires ${status.requirement}`;
    } else if (!status.compatible) {
      detail = `installed but incompatible (${status.version}); requires ${status.requirement}`;
    } else {
      detail = `installed and compatible (${status.version})`;
    }
    lines.push(`    - ${status.label}: ${detail}`);
  }

  lines.push('', '  Planned actions:');
  if (plan.actions.length === 0) {
    lines.push('    - None. All managed prerequisites are already installed.');
  } else {
    plan.actions.forEach((action, index) => {
      lines.push(`    ${index + 1}. ${actionDescription(action)}`);
    });
  }

  lines.push(
    '',
    '  Important notices:',
    '    - Missing or incompatible tools are installed; compatible tools are not upgraded or replaced.',
    '    - Downloads and package-manager operations contact third-party services.',
    '    - Ubuntu follows the package and LLVM repository policy in ICICLE v3.8.0\'s official Dockerfiles.',
    '    - Ubuntu package installation, LLVM repository configuration, and Ubuntu 20.04 CMake installation use sudo.',
    '    - Ubuntu 20.04 builds checksum-verified CMake 3.27.4 source and installs it under /usr/local.',
    '    - The Homebrew installer may request administrator authentication.',
    '    - Homebrew and rustup run their official upstream installers and modify their standard locations.',
    '    - `tokamak-cli --uninstall` does not remove any prerequisite installed here.',
    '    - Review this plan and your organization\'s security policies before approving.',
  );
  return lines.join('\n');
}

export function isPrerequisiteConfirmationAccepted(answer: string): boolean {
  const normalized = answer.trim().toLowerCase();
  return normalized === 'y' || normalized === 'yes';
}

export function assertPrerequisiteInstallMayRunAsCurrentUser(
  getUid: (() => number) | undefined = process.getuid,
): void {
  if (getUid?.() === 0) {
    throw new Error(
      '`--include-prerequisite` must not be run as root. Run tokamak-cli as your normal user; the CLI invokes sudo only for displayed Ubuntu package, repository, and source-install commands.',
    );
  }
}

export function assertPrerequisiteInstallIsInteractive(
  input: Readable = process.stdin,
  output: Writable = process.stdout,
): void {
  if (!('isTTY' in input) || input.isTTY !== true || !('isTTY' in output) || output.isTTY !== true) {
    throw new Error(
      '`--include-prerequisite` is interactive and requires a terminal (TTY). It cannot run unattended.',
    );
  }
}

export async function confirmPrerequisiteInstallation(
  plan: PrerequisiteInstallationPlan,
  input: Readable = process.stdin,
  output: Writable = process.stdout,
): Promise<boolean> {
  assertPrerequisiteInstallIsInteractive(input, output);

  output.write(`${renderPrerequisiteInstallationPlan(plan)}\n\n`);
  const prompt = createInterface({ input, output });
  let answer = '';
  let resolveEnd: (() => void) | undefined;
  const inputEnded = new Promise<void>((resolve) => {
    resolveEnd = resolve;
    input.once('end', resolve);
    input.once('close', resolve);
  });
  try {
    const response = prompt
      .question('Proceed with prerequisite installation? [y/N] ')
      .catch(() => '');
    answer = await Promise.race([
      response,
      inputEnded.then(() => ''),
    ]);
  } catch {
    answer = '';
  } finally {
    if (resolveEnd !== undefined) {
      input.off('end', resolveEnd);
      input.off('close', resolveEnd);
    }
    prompt.close();
  }
  return isPrerequisiteConfirmationAccepted(answer);
}
