import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import vm from 'node:vm';
import { spawn, spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export type CliPlatform = 'linux' | 'macos';

export interface InstallOptions {
  noSetup: boolean;
  trustedSetup: boolean;
  verbose: boolean;
}

export interface RuntimeState {
  packageVersion: string;
  platform: CliPlatform;
  installedAt: string;
}

export interface RuntimeContext {
  cacheRoot: string;
  packageRoot: string;
  platform: CliPlatform;
  platformDir: string;
  runtimeDir: string;
  statePath: string;
  packageVersion: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

interface PrerequisiteFailure {
  name: string;
  reason: string;
}

interface DriveArchiveSelection {
  fileId: string;
  name: string;
  version: [number, number, number];
  generatedAt: string;
}

interface BackendBuildMetadata {
  dependencies?: {
    subcircuitLibrary?: {
      buildVersion?: string;
    };
  };
  packageVersion?: string;
}

const CACHE_DIR_ENV = 'TOKAMAK_ZKEVM_CLI_CACHE_DIR';
const CRS_DRIVE_FOLDER_ID = '14xqCbLoyoVmUVTTlopiXtKnoHPBGL-Sv';
const CRS_DRIVE_FOLDER_URL = 'https://drive.google.com/drive/mobile/folders';
const CRS_DOWNLOAD_BASE_URL = 'https://drive.usercontent.google.com/download';

function logVerbose(enabled: boolean, message: string): void {
  if (enabled) {
    console.error(`[info] ${message}`);
  }
}

export function detectPlatform(): CliPlatform {
  switch (process.platform) {
    case 'darwin':
      return 'macos';
    case 'linux':
      return 'linux';
    default:
      throw new Error(
        `Unsupported platform: ${process.platform}. Native tokamak-cli installs currently support only macOS and Linux. Use WSL2 or Docker on Windows.`,
      );
  }
}

function pathEntries(): string[] {
  return (process.env.PATH ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function isExecutableFile(target: string): boolean {
  try {
    fsSync.accessSync(target, fsSync.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function commandExists(command: string): boolean {
  if (command.includes(path.sep)) {
    return isExecutableFile(command);
  }
  return pathEntries().some((entry) => isExecutableFile(path.join(entry, command)));
}

function prerequisiteInstallHint(platform: CliPlatform): string {
  if (platform === 'macos') {
    return [
      'Install the missing prerequisites and retry:',
      '  Install Apple developer tools with either `xcode-select --install` or a full Xcode installation.',
      '  brew install node cmake',
      '  curl https://sh.rustup.rs -sSf | sh',
      '  source "$HOME/.cargo/env"',
    ].join('\n');
  }

  return [
    'Install the missing prerequisites and retry:',
    '  sudo apt-get update',
    '  sudo apt-get install -y build-essential cmake unzip tar pkg-config',
    '  curl https://sh.rustup.rs -sSf | sh',
    '  source "$HOME/.cargo/env"',
    '  Install Node.js 20 or newer from nodejs.org or NodeSource if your distro packages are older.',
  ].join('\n');
}

function collectPrerequisiteFailures(
  platform: CliPlatform,
  options: InstallOptions,
): PrerequisiteFailure[] {
  const failures: PrerequisiteFailure[] = [];
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  if (!Number.isFinite(nodeMajor) || nodeMajor < 20) {
    failures.push({
      name: 'node',
      reason: `Node.js ${process.version} is installed, but tokamak-cli requires Node.js 20 or newer.`,
    });
  }

  const requiredCommands = ['npm', 'rustc', 'cargo', 'cmake', 'tar'];
  if (!options.noSetup && !options.trustedSetup) {
    requiredCommands.push('unzip');
  }

  for (const command of requiredCommands) {
    if (!commandExists(command)) {
      failures.push({
        name: command,
        reason: `${command} is not available on PATH.`,
      });
    }
  }

  if (platform === 'macos') {
    for (const compiler of ['cc', 'c++', 'install_name_tool']) {
      if (!commandExists(compiler)) {
        failures.push({
          name: compiler,
          reason: `${compiler} is not available on PATH. Install Apple developer tools.`,
        });
      }
    }
  } else {
    for (const command of ['cc', 'c++', 'make', 'pkg-config']) {
      if (!commandExists(command)) {
        failures.push({
          name: command,
          reason: `${command} is not available on PATH.`,
        });
      }
    }
  }

  return failures;
}

function ensureInstallPrerequisites(platform: CliPlatform, options: InstallOptions): void {
  const failures = collectPrerequisiteFailures(platform, options);
  if (failures.length === 0) {
    return;
  }

  const lines = failures.map((failure) => `- ${failure.name}: ${failure.reason}`);
  throw new Error(
    [
      'tokamak-cli cannot start the local install because required build prerequisites are missing.',
      ...lines,
      prerequisiteInstallHint(platform),
    ].join('\n'),
  );
}

export function resolveCacheRoot(): string {
  const configured = process.env[CACHE_DIR_ENV]?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.join(os.homedir(), '.tokamak-zk-evm', 'cli');
}

export function resolvePackageRoot(): string {
  return path.resolve(__dirname, '..');
}

function resolveVendoredBackendRoot(packageRoot: string): string {
  return path.join(packageRoot, 'vendor', 'backend');
}

async function resolvePackageVersion(packageRoot: string): Promise<string> {
  const manifestPath = path.join(packageRoot, 'package.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as { version?: string };
  if (!manifest.version) {
    throw new Error(`Package version is missing from ${manifestPath}.`);
  }
  return manifest.version;
}

export async function createRuntimeContext(): Promise<RuntimeContext> {
  const packageRoot = resolvePackageRoot();
  const packageVersion = await resolvePackageVersion(packageRoot);
  const platform = detectPlatform();
  const cacheRoot = resolveCacheRoot();
  const platformDir = path.join(cacheRoot, platform);
  return {
    cacheRoot,
    packageRoot,
    platform,
    platformDir,
    runtimeDir: path.join(platformDir, 'runtime'),
    statePath: path.join(platformDir, 'installation.json'),
    packageVersion,
  };
}

export async function readInstalledState(platform: CliPlatform): Promise<RuntimeState | null> {
  const statePath = path.join(resolveCacheRoot(), platform, 'installation.json');
  try {
    const contents = await fs.readFile(statePath, 'utf8');
    return JSON.parse(contents) as RuntimeState;
  } catch {
    return null;
  }
}

export async function requireInstalledRuntime(): Promise<RuntimeContext> {
  const context = await createRuntimeContext();
  const state = await readInstalledState(context.platform);
  if (state === null) {
    throw new Error('Tokamak zk-EVM runtime is not installed. Run `tokamak-cli --install` first.');
  }
  await fs.access(context.runtimeDir);
  return {
    ...context,
    packageVersion: state.packageVersion,
  };
}

export function runtimePaths(context: RuntimeContext) {
  const resourceDir = path.join(context.runtimeDir, 'resource');
  const setupOutputDir = path.join(resourceDir, 'setup', 'output');
  const synthOutputDir = path.join(resourceDir, 'synthesizer', 'output');
  const preprocessOutputDir = path.join(resourceDir, 'preprocess', 'output');
  const proveOutputDir = path.join(resourceDir, 'prove', 'output');
  const binaryDir = path.join(context.runtimeDir, 'bin');
  const icicleLibDir = path.join(context.runtimeDir, 'backend-lib', 'icicle', 'lib');
  return {
    resourceDir,
    setupOutputDir,
    synthOutputDir,
    preprocessOutputDir,
    proveOutputDir,
    binaryDir,
    icicleLibDir,
    preprocessBinary: path.join(binaryDir, 'preprocess'),
    proveBinary: path.join(binaryDir, 'prove'),
    verifyBinary: path.join(binaryDir, 'verify'),
    trustedSetupBinary: path.join(binaryDir, 'trusted-setup'),
  };
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function emptyDir(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
  await fs.mkdir(dirPath, { recursive: true });
}

function prependEnvPath(existing: string | undefined, nextValue: string): string {
  return existing && existing.length > 0 ? `${nextValue}:${existing}` : nextValue;
}

export function backendEnvironment(context: RuntimeContext): NodeJS.ProcessEnv {
  const paths = runtimePaths(context);
  const env: NodeJS.ProcessEnv = { ...process.env };
  env.LD_LIBRARY_PATH = prependEnvPath(env.LD_LIBRARY_PATH, paths.icicleLibDir);
  if (context.platform === 'macos') {
    env.DYLD_LIBRARY_PATH = prependEnvPath(env.DYLD_LIBRARY_PATH, paths.icicleLibDir);
    env.ICICLE_BACKEND_INSTALL_DIR = path.join(paths.icicleLibDir, 'backend');
    return env;
  }

  const backendDir = path.join(paths.icicleLibDir, 'backend');
  env.ICICLE_BACKEND_INSTALL_DIR = '';
  if (process.platform === 'linux') {
    env.ICICLE_BACKEND_INSTALL_DIR = backendDir;
  }
  return env;
}

export async function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    verbose?: boolean;
  } = {},
): Promise<CommandResult> {
  const { cwd, env, verbose = false } = options;
  if (verbose) {
    console.error(`[info] Command: ${command} ${args.join(' ')}`);
  }
  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited with code ${code ?? 'unknown'}`));
      }
    });
  });
}

async function ensureVendoredBackendExists(packageRoot: string): Promise<string> {
  const backendRoot = resolveVendoredBackendRoot(packageRoot);
  const cargoManifestPath = path.join(backendRoot, 'Cargo.toml');
  try {
    await fs.access(cargoManifestPath);
  } catch {
    throw new Error('The vendored backend workspace is missing. Rebuild the package so that vendor/backend is populated.');
  }
  return backendRoot;
}

async function readLinuxUbuntuMajorVersion(): Promise<'20' | '22'> {
  try {
    const osRelease = await fs.readFile('/etc/os-release', 'utf8');
    const match = osRelease.match(/^VERSION_ID="?(\d+)/mu);
    const major = match?.[1] ?? '22';
    return major === '20' ? '20' : '22';
  } catch {
    return '22';
  }
}

async function buildBackendReleaseBinaries(
  backendRoot: string,
  options: InstallOptions,
): Promise<void> {
  if (options.trustedSetup) {
    await runCommand('cargo', ['build', '-p', 'trusted-setup', '--release'], {
      cwd: backendRoot,
      verbose: options.verbose,
    });
  }
  await runCommand('cargo', ['build', '-p', 'preprocess', '--release'], {
    cwd: backendRoot,
    verbose: options.verbose,
  });
  await runCommand('cargo', ['build', '-p', 'prove', '--release'], {
    cwd: backendRoot,
    verbose: options.verbose,
  });
  await runCommand('cargo', ['build', '-p', 'verify', '--release'], {
    cwd: backendRoot,
    verbose: options.verbose,
  });
}

async function copyBuiltBackendBinaries(
  context: RuntimeContext,
  backendRoot: string,
  options: InstallOptions,
): Promise<void> {
  const paths = runtimePaths(context);
  const builtBinaryNames = ['preprocess', 'prove', 'verify'];
  if (options.trustedSetup) {
    builtBinaryNames.push('trusted-setup');
  }

  await ensureDir(paths.binaryDir);
  for (const binaryName of builtBinaryNames) {
    const sourcePath = path.join(backendRoot, 'target', 'release', binaryName);
    await fs.access(sourcePath);
    await fs.copyFile(sourcePath, path.join(paths.binaryDir, binaryName));
  }
}

async function downloadFile(url: string, destinationPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  if (response.body === null) {
    throw new Error(`Download response did not contain a body: ${url}`);
  }
  await ensureDir(path.dirname(destinationPath));
  await pipeline(
    Readable.fromWeb(response.body as globalThis.ReadableStream<Uint8Array>),
    fsSync.createWriteStream(destinationPath),
  );
}

async function extractTarArchive(archivePath: string, destinationPath: string, verbose: boolean): Promise<void> {
  await ensureDir(destinationPath);
  await runCommand('tar', ['-xzf', archivePath, '-C', destinationPath], {
    verbose,
  });
}

async function copyDirectoryContents(sourceDir: string, destinationDir: string): Promise<void> {
  await ensureDir(path.dirname(destinationDir));
  await fs.cp(sourceDir, destinationDir, { recursive: true });
}

async function installIcicleRuntime(context: RuntimeContext, verbose: boolean): Promise<void> {
  const paths = runtimePaths(context);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-icicle-'));
  try {
    if (context.platform === 'macos') {
      const commonTarball = path.join(tempRoot, 'icicle_3_8_0-macOS.tar.gz');
      const backendTarball = path.join(tempRoot, 'icicle_3_8_0-macOS-Metal.tar.gz');
      await downloadFile(
        'https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/icicle_3_8_0-macOS.tar.gz',
        commonTarball,
      );
      await downloadFile(
        'https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/icicle_3_8_0-macOS-Metal.tar.gz',
        backendTarball,
      );
      await extractTarArchive(commonTarball, tempRoot, verbose);
      await extractTarArchive(backendTarball, tempRoot, verbose);
    } else {
      const ubuntuMajor = await readLinuxUbuntuMajorVersion();
      const commonTarball = path.join(tempRoot, `icicle_3_8_0-ubuntu${ubuntuMajor}.tar.gz`);
      const backendTarball = path.join(tempRoot, `icicle_3_8_0-ubuntu${ubuntuMajor}-cuda122.tar.gz`);
      await downloadFile(
        `https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/icicle_3_8_0-ubuntu${ubuntuMajor}.tar.gz`,
        commonTarball,
      );
      await downloadFile(
        `https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/icicle_3_8_0-ubuntu${ubuntuMajor}-cuda122.tar.gz`,
        backendTarball,
      );
      await extractTarArchive(commonTarball, tempRoot, verbose);
      await extractTarArchive(backendTarball, tempRoot, verbose);
    }

    await copyDirectoryContents(path.join(tempRoot, 'icicle'), path.join(context.runtimeDir, 'backend-lib', 'icicle'));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

function applyInstallNameTool(binaryPath: string, rpath: string, verbose: boolean): void {
  const result = spawnSync('install_name_tool', ['-add_rpath', rpath, binaryPath], {
    stdio: verbose ? 'inherit' : 'ignore',
  });
  if (result.error) {
    throw result.error;
  }
}

async function configureMacosRuntime(context: RuntimeContext, verbose: boolean): Promise<void> {
  if (context.platform !== 'macos') {
    return;
  }
  const paths = runtimePaths(context);
  const rpath = '@executable_path/../backend-lib/icicle/lib';
  for (const binaryName of ['trusted-setup', 'preprocess', 'prove', 'verify']) {
    const binaryPath = path.join(paths.binaryDir, binaryName);
    if (fsSync.existsSync(binaryPath)) {
      applyInstallNameTool(binaryPath, rpath, verbose);
    }
  }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
}

async function findNamedFile(rootDir: string, filename: string): Promise<string> {
  const queue: string[] = [rootDir];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isFile() && entry.name === filename) {
        return entryPath;
      }
      if (entry.isDirectory()) {
        queue.push(entryPath);
      }
    }
  }
  throw new Error(`Missing ${filename} under ${rootDir}`);
}

async function findNamedFileIfExists(rootDir: string, filename: string): Promise<string | null> {
  try {
    return await findNamedFile(rootDir, filename);
  } catch {
    return null;
  }
}

function parseDriveArchiveSelection(html: string): DriveArchiveSelection {
  const match = html.match(/window\['_DRIVE_ivd'\]\s*=\s*('(?:\\.|[^'])*')/u);
  if (!match) {
    throw new Error('Unable to locate Google Drive listing payload.');
  }

  const decoded = vm.runInNewContext(match[1]) as string;
  const payload = JSON.parse(decoded) as unknown;
  const entriesById = new Map<string, DriveArchiveSelection>();

  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) {
      return;
    }

    if (typeof node[0] === 'string' && typeof node[2] === 'string' && node[3] === 'application/zip') {
      const parsed = node[2].match(/v(\d+)\.(\d+)\.(\d+)-(\d{8}T\d{6}Z)\.zip$/iu);
      if (parsed) {
        entriesById.set(node[0], {
          fileId: node[0],
          name: node[2],
          version: [Number(parsed[1]), Number(parsed[2]), Number(parsed[3])],
          generatedAt: parsed[4],
        });
      }
    }

    for (const child of node) {
      walk(child);
    }
  };

  walk(payload);

  const entries = [...entriesById.values()];
  if (entries.length === 0) {
    throw new Error('No CRS archive matching the expected naming convention was found in Google Drive.');
  }

  entries.sort((left, right) => {
    for (let index = 0; index < 3; index += 1) {
      if (left.version[index] !== right.version[index]) {
        return right.version[index] - left.version[index];
      }
    }
    return right.generatedAt.localeCompare(left.generatedAt);
  });
  return entries[0];
}

async function selectLatestDriveArchive(): Promise<DriveArchiveSelection> {
  const response = await fetch(`${CRS_DRIVE_FOLDER_URL}/${CRS_DRIVE_FOLDER_ID}`);
  if (!response.ok) {
    throw new Error(`Failed to read CRS listing: ${response.status} ${response.statusText}`);
  }
  return parseDriveArchiveSelection(await response.text());
}

function driveDirectDownloadUrl(fileId: string): string {
  return `${CRS_DOWNLOAD_BASE_URL}?id=${fileId}&export=download&confirm=t`;
}

async function downloadLatestCrsArchive(destinationDir: string): Promise<{ archivePath: string; archiveName: string }> {
  const selection = await selectLatestDriveArchive();
  const archivePath = path.join(destinationDir, selection.name);
  await downloadFile(driveDirectDownloadUrl(selection.fileId), archivePath);
  return {
    archivePath,
    archiveName: selection.name,
  };
}

async function extractZipArchive(zipPath: string, destinationDir: string, verbose: boolean): Promise<void> {
  await ensureDir(destinationDir);
  await runCommand('unzip', ['-q', zipPath, '-d', destinationDir], {
    verbose,
  });
}

async function validateDownloadedCrsVersions(extractedDir: string, backendRoot: string, archiveName: string): Promise<{
  mpcMetadataPath: string;
  provenancePath: string | null;
}> {
  const mpcMetadataPath = await findNamedFile(extractedDir, 'build-metadata-mpc-setup.json');
  const mpcMetadata = await readJsonFile<BackendBuildMetadata>(mpcMetadataPath);
  const mpcSubcircuitVersion = mpcMetadata.dependencies?.subcircuitLibrary?.buildVersion;
  const mpcVersion = mpcMetadata.packageVersion;
  if (!mpcSubcircuitVersion || !mpcVersion) {
    throw new Error(`CRS archive ${archiveName} is missing required metadata.`);
  }

  for (const backendName of ['preprocess', 'prove', 'verify']) {
    const backendMetadataPath = path.join(
      backendRoot,
      'target',
      'release',
      `build-metadata-${backendName}.json`,
    );
    const backendMetadata = await readJsonFile<BackendBuildMetadata>(backendMetadataPath);
    const backendVersion = backendMetadata.packageVersion;
    const backendSubcircuitVersion = backendMetadata.dependencies?.subcircuitLibrary?.buildVersion;
    if (backendVersion !== mpcVersion) {
      throw new Error(
        `Backend package ${backendName} has version ${backendVersion ?? '<missing>'}, but the downloaded CRS expects backend version ${mpcVersion}.`,
      );
    }
    if (backendSubcircuitVersion !== mpcSubcircuitVersion) {
      throw new Error(
        `Backend package ${backendName} embeds subcircuit-library ${backendSubcircuitVersion ?? '<missing>'}, but CRS archive ${archiveName} expects ${mpcSubcircuitVersion}.`,
      );
    }
  }

  return {
    mpcMetadataPath,
    provenancePath: await findNamedFileIfExists(extractedDir, 'crs_provenance.json'),
  };
}

async function installDownloadedSetup(
  context: RuntimeContext,
  backendRoot: string,
  verbose: boolean,
): Promise<void> {
  const paths = runtimePaths(context);
  const archiveDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-crs-download-'));
  const extractedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-crs-extract-'));
  try {
    const { archivePath, archiveName } = await downloadLatestCrsArchive(archiveDir);
    await extractZipArchive(archivePath, extractedDir, verbose);
    const { mpcMetadataPath, provenancePath } = await validateDownloadedCrsVersions(
      extractedDir,
      backendRoot,
      archiveName,
    );

    await ensureDir(paths.setupOutputDir);
    await fs.copyFile(
      await findNamedFile(extractedDir, 'combined_sigma.rkyv'),
      path.join(paths.setupOutputDir, 'combined_sigma.rkyv'),
    );
    await fs.copyFile(
      await findNamedFile(extractedDir, 'sigma_preprocess.rkyv'),
      path.join(paths.setupOutputDir, 'sigma_preprocess.rkyv'),
    );
    await fs.copyFile(
      await findNamedFile(extractedDir, 'sigma_verify.rkyv'),
      path.join(paths.setupOutputDir, 'sigma_verify.rkyv'),
    );
    await fs.copyFile(
      mpcMetadataPath,
      path.join(paths.setupOutputDir, 'build-metadata-mpc-setup.json'),
    );
    if (provenancePath !== null) {
      await fs.copyFile(provenancePath, path.join(paths.setupOutputDir, 'crs_provenance.json'));
    }
  } finally {
    await fs.rm(archiveDir, { recursive: true, force: true });
    await fs.rm(extractedDir, { recursive: true, force: true });
  }
}

async function writeSkippedSetupNotice(context: RuntimeContext): Promise<void> {
  const paths = runtimePaths(context);
  await ensureDir(paths.setupOutputDir);
  await fs.writeFile(
    path.join(paths.setupOutputDir, 'README.txt'),
    'Setup artifacts were skipped during installation.\n',
    'utf8',
  );
}

async function runTrustedSetup(context: RuntimeContext, verbose: boolean): Promise<void> {
  const paths = runtimePaths(context);
  await ensureDir(paths.setupOutputDir);
  await fs.access(paths.trustedSetupBinary);
  await runCommand(
    paths.trustedSetupBinary,
    ['--output', paths.setupOutputDir, '--fixed-tau'],
    {
      env: backendEnvironment(context),
      verbose,
    },
  );
}

export async function installRuntime(options: InstallOptions): Promise<RuntimeContext> {
  const context = await createRuntimeContext();
  ensureInstallPrerequisites(context.platform, options);
  const backendRoot = await ensureVendoredBackendExists(context.packageRoot);

  logVerbose(options.verbose, `Using vendored backend ${backendRoot}`);
  await emptyDir(context.runtimeDir);
  await buildBackendReleaseBinaries(backendRoot, options);
  await copyBuiltBackendBinaries(context, backendRoot, options);
  await installIcicleRuntime(context, options.verbose);
  await configureMacosRuntime(context, options.verbose);

  if (options.noSetup) {
    await writeSkippedSetupNotice(context);
  } else if (options.trustedSetup) {
    await runTrustedSetup(context, options.verbose);
  } else {
    await installDownloadedSetup(context, backendRoot, options.verbose);
  }

  const state: RuntimeState = {
    packageVersion: context.packageVersion,
    platform: context.platform,
    installedAt: new Date().toISOString(),
  };
  await fs.writeFile(context.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return context;
}
