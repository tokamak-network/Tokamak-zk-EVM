import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

export type CliPlatform = 'linux' | 'macos';

export interface InstallOptions {
  docker: boolean;
  noSetup: boolean;
  trustedSetup: boolean;
  verbose: boolean;
}

export interface RuntimeState {
  dockerEnvironment?: DockerEnvironment;
  installMode?: 'native' | 'docker';
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

export type DockerEnvironment = 'ubuntu22' | 'ubuntu22-cuda122';

interface DockerBootstrap {
  version: 1;
  createdAt: string;
  dockerEnvironment: DockerEnvironment;
  imageName: string;
  packageVersion: string;
  platform: 'linux';
  useGpus: boolean;
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
  sizeBytes: number;
}

interface ResumableDownloadState {
  archiveName: string;
  contentLength: number;
  fileId: string;
}

interface BackendBuildMetadata {
  dependencies?: {
    subcircuitLibrary?: {
      buildVersion?: string;
    };
  };
  packageVersion?: string;
}

interface IcicleAsset {
  fileName: string;
  sha256: string;
  url: string;
}

interface IcicleManifest {
  version: string;
  assets: Record<string, IcicleAsset>;
}

interface DownloadRequestDefinition {
  headers?: Record<string, string>;
  url: string;
}

interface CargoMetadata {
  target_directory?: string;
}

const BACKEND_BINARY_NAMES = ['preprocess', 'prove', 'verify'] as const;

const CACHE_DIR_ENV = 'TOKAMAK_ZKEVM_CLI_CACHE_DIR';
const CRS_DRIVE_FOLDER_ID = '14xqCbLoyoVmUVTTlopiXtKnoHPBGL-Sv';
const CRS_DRIVE_FOLDER_URL = 'https://drive.google.com/drive/mobile/folders';
const CRS_DOWNLOAD_BASE_URL = 'https://drive.usercontent.google.com/download';
const CRS_DOWNLOAD_CHUNK_SIZE = 512 * 1024 * 1024;
const CRS_DOWNLOAD_ANONYMOUS_MAX_RETRIES = 5;
const CRS_DOWNLOAD_RETRY_BASE_DELAY_MS = 1_000;
const DOWNLOAD_PROGRESS_LOG_INTERVAL_MS = 2_000;
const DOWNLOAD_PROGRESS_PERCENT_STEP = 5;
const DOCKER_BOOTSTRAP_VERSION = 1;
const DOCKER_CONTAINER_CACHE_ROOT = '/tokamak-cache';
const DOCKER_CUDA_PROBE_IMAGE = 'nvidia/cuda:12.2.0-base-ubuntu22.04';
const DOCKER_CUDA_BASE_IMAGE = 'nvidia/cuda:12.2.0-devel-ubuntu22.04';
const DOCKER_UBUNTU_BASE_IMAGE = 'ubuntu:22.04';
const DOCKERFILE_PATH = path.join('docker', 'Dockerfile');
const ICICLE_VERSION = '3.8.0';
const ICICLE_MANIFEST_PATH = path.join('manifests', `icicle-v${ICICLE_VERSION}.json`);

function logVerbose(enabled: boolean, message: string): void {
  if (enabled) {
    writeStderrLine(`[info] ${message}`);
  }
}

let activeDownloadProgressLength = 0;

function flushActiveDownloadProgressLine(): void {
  if (activeDownloadProgressLength === 0) {
    return;
  }
  process.stderr.write('\n');
  activeDownloadProgressLength = 0;
}

function writeStderrLine(message: string): void {
  flushActiveDownloadProgressLine();
  console.error(message);
}

function logDownloadProgress(message: string, done = false): void {
  const line = `[download] ${message}`;
  if (!process.stderr.isTTY) {
    writeStderrLine(line);
    return;
  }

  const renderedLine = line.padEnd(activeDownloadProgressLength, ' ');
  if (done) {
    process.stderr.write(`\r${renderedLine}\n`);
    activeDownloadProgressLength = 0;
    return;
  }

  process.stderr.write(`\r${renderedLine}`);
  activeDownloadProgressLength = renderedLine.length;
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
  if (options.docker) {
    return;
  }

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
  return path.join(os.homedir(), '.tokamak-zk-evm');
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

async function removeDirectoryIfEmpty(target: string): Promise<void> {
  try {
    const entries = await fs.readdir(target);
    if (entries.length === 0) {
      await fs.rmdir(target);
    }
  } catch {
    // Ignore missing directories or directories that cannot be removed.
  }
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

function dockerBootstrapDir(context: RuntimeContext): string {
  return path.join(context.platformDir, 'docker');
}

function dockerBootstrapPath(context: RuntimeContext): string {
  return path.join(dockerBootstrapDir(context), 'bootstrap.json');
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function emptyDir(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
  await fs.mkdir(dirPath, { recursive: true });
}

async function fileSizeIfExists(target: string): Promise<number | null> {
  try {
    const stat = await fs.stat(target);
    return stat.size;
  } catch {
    return null;
  }
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function sha256FileHex(filePath: string): Promise<string> {
  const hasher = crypto.createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = fsSync.createReadStream(filePath);
    stream.on('data', (chunk: Buffer | string) => {
      hasher.update(chunk);
    });
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hasher.digest('hex');
}

function normalizeSha256(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return /^[a-f0-9]{64}$/u.test(normalized) ? normalized : null;
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
    writeStderrLine(`[info] Command: ${command} ${args.join(' ')}`);
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

async function commandSucceeds(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    verbose?: boolean;
  } = {},
): Promise<boolean> {
  const { cwd, env, verbose = false } = options;
  if (verbose) {
    writeStderrLine(`[info] Command: ${command} ${args.join(' ')}`);
  }
  return await new Promise<boolean>((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: 'ignore',
    });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

async function dockerDaemonAvailable(verbose: boolean): Promise<boolean> {
  if (!commandExists('docker')) {
    logVerbose(verbose, 'Docker is not available on PATH.');
    return false;
  }
  if (await commandSucceeds('docker', ['info'], { verbose: false })) {
    return true;
  }
  logVerbose(verbose, 'Docker daemon is not running or is not reachable.');
  return false;
}

async function ensureDockerDaemonAvailable(verbose: boolean): Promise<void> {
  if (!(await dockerDaemonAvailable(verbose))) {
    throw new Error('Docker is required for `tokamak-cli --install --docker`, but the Docker daemon is not available.');
  }
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

async function linuxCudaBackendAvailable(verbose: boolean): Promise<boolean> {
  if (process.platform !== 'linux') {
    return false;
  }

  if (!commandExists('nvidia-smi')) {
    logVerbose(verbose, 'Skipping CUDA ICICLE backend installation because `nvidia-smi` is not available.');
    return false;
  }

  try {
    const result = await runCommand(
      'nvidia-smi',
      ['--query-gpu=name,driver_version', '--format=csv,noheader'],
      { verbose: false },
    );
    const detectedDevices = result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (detectedDevices.length === 0) {
      logVerbose(verbose, 'Skipping CUDA ICICLE backend installation because no NVIDIA GPUs were reported.');
      return false;
    }
    logVerbose(
      verbose,
      `Installing CUDA ICICLE backend for detected NVIDIA device(s): ${detectedDevices.join('; ')}`,
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logVerbose(
      verbose,
      `Skipping CUDA ICICLE backend installation because CUDA capability detection failed: ${message}`,
    );
    return false;
  }
}

async function dockerCudaAvailable(verbose: boolean): Promise<boolean> {
  const args = ['run', '--rm', '--gpus', 'all', DOCKER_CUDA_PROBE_IMAGE, 'nvidia-smi'];
  try {
    const succeeded = verbose
      ? await runCommand('docker', args, { verbose }).then(() => true)
      : await commandSucceeds('docker', args);
    if (!succeeded) {
      logVerbose(verbose, 'Docker CUDA probe failed; using CPU-only Ubuntu 22 environment.');
      return false;
    }
    logVerbose(verbose, 'Docker CUDA probe succeeded with `--gpus all` and `nvidia-smi`.');
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logVerbose(verbose, `Docker CUDA probe failed; using CPU-only Ubuntu 22 environment: ${message}`);
    return false;
  }
}

function dockerBaseImage(environment: DockerEnvironment): string {
  return environment === 'ubuntu22-cuda122' ? DOCKER_CUDA_BASE_IMAGE : DOCKER_UBUNTU_BASE_IMAGE;
}

function dockerImageName(packageVersion: string, environment: DockerEnvironment): string {
  const sanitizedVersion = packageVersion.replace(/[^a-zA-Z0-9_.-]/gu, '-');
  return `tokamak-zk-evm-cli:${sanitizedVersion}-${environment}`;
}

function dockerRunPrefix(bootstrap: DockerBootstrap): string[] {
  const args = ['run', '--rm'];
  if (bootstrap.useGpus) {
    args.push('--gpus', 'all');
  }
  return args;
}

function dockerUserArgs(): string[] {
  if (typeof process.getuid !== 'function' || typeof process.getgid !== 'function') {
    return [];
  }
  return ['--user', `${process.getuid()}:${process.getgid()}`];
}

function toContainerPath(hostPath: string, context: RuntimeContext): string {
  const relative = path.relative(context.cacheRoot, hostPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Docker bootstrap cannot map path outside the cache root: ${hostPath}`);
  }
  return path.posix.join(DOCKER_CONTAINER_CACHE_ROOT, ...relative.split(path.sep));
}

function toContainerArgument(arg: string, context: RuntimeContext): string {
  if (!path.isAbsolute(arg)) {
    return arg;
  }
  return toContainerPath(arg, context);
}

function dockerBackendEnvironment(context: RuntimeContext): Record<string, string> {
  const paths = runtimePaths(context);
  const icicleLibDir = toContainerPath(paths.icicleLibDir, context);
  return {
    LD_LIBRARY_PATH: icicleLibDir,
    ICICLE_BACKEND_INSTALL_DIR: path.posix.join(icicleLibDir, 'backend'),
  };
}

function validateDockerBootstrap(value: unknown): DockerBootstrap | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const candidate = value as Partial<DockerBootstrap>;
  if (
    candidate.version !== DOCKER_BOOTSTRAP_VERSION ||
    candidate.platform !== 'linux' ||
    typeof candidate.imageName !== 'string' ||
    typeof candidate.packageVersion !== 'string' ||
    typeof candidate.createdAt !== 'string' ||
    typeof candidate.useGpus !== 'boolean' ||
    (candidate.dockerEnvironment !== 'ubuntu22' && candidate.dockerEnvironment !== 'ubuntu22-cuda122')
  ) {
    return null;
  }
  return candidate as DockerBootstrap;
}

async function readDockerBootstrap(context: RuntimeContext): Promise<DockerBootstrap | null> {
  if (context.platform !== 'linux') {
    return null;
  }
  try {
    const parsed = JSON.parse(await fs.readFile(dockerBootstrapPath(context), 'utf8')) as unknown;
    return validateDockerBootstrap(parsed);
  } catch {
    return null;
  }
}

async function dockerBootstrapRunnable(context: RuntimeContext, verbose: boolean): Promise<DockerBootstrap | null> {
  const bootstrap = await readDockerBootstrap(context);
  if (bootstrap === null) {
    return null;
  }
  if (!(await dockerDaemonAvailable(verbose))) {
    return null;
  }
  return bootstrap;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/gu, `'\\''`)}'`;
}

async function writeDockerBootstrap(context: RuntimeContext, bootstrap: DockerBootstrap): Promise<void> {
  const bootstrapDir = dockerBootstrapDir(context);
  await ensureDir(bootstrapDir);
  await fs.writeFile(dockerBootstrapPath(context), `${JSON.stringify(bootstrap, null, 2)}\n`, 'utf8');

  const env = dockerBackendEnvironment(context);
  const scriptPath = path.join(bootstrapDir, 'run.sh');
  const gpuArgs = bootstrap.useGpus ? ' --gpus all' : '';
  const script = [
    '#!/usr/bin/env sh',
    'set -eu',
    'exec docker run --rm \\',
    '  --user "$(id -u):$(id -g)" \\',
    `${gpuArgs ? `  ${gpuArgs.trim()} \\` : ''}`,
    `  -v ${shellQuote(`${context.cacheRoot}:${DOCKER_CONTAINER_CACHE_ROOT}`)} \\`,
    '  -e HOME=/tmp \\',
    `  -e ${shellQuote(`LD_LIBRARY_PATH=${env.LD_LIBRARY_PATH}`)} \\`,
    `  -e ${shellQuote(`ICICLE_BACKEND_INSTALL_DIR=${env.ICICLE_BACKEND_INSTALL_DIR}`)} \\`,
    `  ${shellQuote(bootstrap.imageName)} "$@"`,
    '',
  ].filter((line) => line !== '').join('\n');
  await fs.writeFile(scriptPath, script, 'utf8');
  await fs.chmod(scriptPath, 0o755);
}

async function runDockerBootstrapCommand(
  context: RuntimeContext,
  bootstrap: DockerBootstrap,
  command: string,
  args: string[],
  verbose: boolean,
): Promise<CommandResult> {
  const env = dockerBackendEnvironment(context);
  const containerCommand = toContainerPath(command, context);
  const dockerArgs = [
    ...dockerRunPrefix(bootstrap),
    ...dockerUserArgs(),
    '-v',
    `${context.cacheRoot}:${DOCKER_CONTAINER_CACHE_ROOT}`,
    '-e',
    'HOME=/tmp',
    '-e',
    `LD_LIBRARY_PATH=${env.LD_LIBRARY_PATH}`,
    '-e',
    `ICICLE_BACKEND_INSTALL_DIR=${env.ICICLE_BACKEND_INSTALL_DIR}`,
    '--entrypoint',
    containerCommand,
    bootstrap.imageName,
    ...args.map((arg) => toContainerArgument(arg, context)),
  ];
  return await runCommand('docker', dockerArgs, { verbose });
}

export async function runBackendCommand(
  context: RuntimeContext,
  command: string,
  args: string[],
  verbose: boolean,
): Promise<CommandResult> {
  const bootstrap = await dockerBootstrapRunnable(context, verbose);
  if (bootstrap !== null) {
    logVerbose(verbose, `Running backend command in Docker bootstrap ${bootstrap.dockerEnvironment}.`);
    return await runDockerBootstrapCommand(context, bootstrap, command, args, verbose);
  }

  return await runCommand(command, args, {
    env: backendEnvironment(context),
    verbose,
  });
}

async function buildBackendReleaseBinaries(
  backendRoot: string,
  options: InstallOptions,
): Promise<string> {
  const packages = options.trustedSetup
    ? ['trusted-setup', ...BACKEND_BINARY_NAMES]
    : [...BACKEND_BINARY_NAMES];
  for (const packageName of packages) {
    await runCommand('cargo', ['build', '-p', packageName, '--release'], {
      cwd: backendRoot,
      verbose: options.verbose,
    });
  }
  return resolveCargoReleaseDir(backendRoot);
}

function resolveCargoReleaseDir(backendRoot: string): string {
  const result = spawnSync('cargo', ['metadata', '--format-version', '1', '--no-deps'], {
    cwd: backendRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`cargo metadata exited with code ${result.status ?? 'unknown'}: ${result.stderr}`);
  }

  const metadata = JSON.parse(result.stdout) as CargoMetadata;
  const targetDirectory = metadata.target_directory?.trim();
  if (!targetDirectory) {
    throw new Error(`cargo metadata did not report a target_directory for ${backendRoot}`);
  }
  return path.join(targetDirectory, 'release');
}

async function copyBuiltBackendBinaries(
  context: RuntimeContext,
  backendReleaseDir: string,
  options: InstallOptions,
): Promise<void> {
  const paths = runtimePaths(context);
  const builtBinaryNames = options.trustedSetup
    ? ['trusted-setup', ...BACKEND_BINARY_NAMES]
    : [...BACKEND_BINARY_NAMES];

  await ensureDir(paths.binaryDir);
  for (const binaryName of builtBinaryNames) {
    const sourcePath = path.join(backendReleaseDir, binaryName);
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
  const contentLength = Number.parseInt(response.headers.get('content-length') ?? '', 10);
  await streamDownloadToFile(response, destinationPath, {
    label: path.basename(destinationPath),
    totalBytes: Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null,
  });
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const digits = value >= 100 || index === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[index]}`;
}

function formatDownloadProgress(
  label: string,
  downloadedBytes: number,
  totalBytes: number | null,
  done: boolean,
): string {
  if (totalBytes !== null && totalBytes > 0) {
    const percent = Math.min((downloadedBytes / totalBytes) * 100, 100);
    const verb = done ? 'Completed' : 'Downloading';
    return `${verb} ${label}: ${percent.toFixed(1)}% (${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)})`;
  }
  const verb = done ? 'Completed' : 'Downloading';
  return `${verb} ${label}: ${formatBytes(downloadedBytes)}`;
}

async function streamDownloadToFile(
  response: Response,
  destinationPath: string,
  options: {
    append?: boolean;
    finalizeProgress?: boolean;
    initialBytes?: number;
    label: string;
    totalBytes: number | null;
  },
): Promise<void> {
  if (response.body === null) {
    throw new Error('Download response did not contain a body.');
  }

  const {
    append = false,
    finalizeProgress = true,
    initialBytes = 0,
    label,
    totalBytes,
  } = options;
  const writer = fsSync.createWriteStream(destinationPath, { flags: append ? 'a' : 'w' });
  const reader = response.body.getReader();
  let downloadedBytes = initialBytes;
  let lastLoggedAt = 0;
  let lastLoggedPercentStep = totalBytes !== null && totalBytes > 0
    ? Math.floor((downloadedBytes / totalBytes) * 100 / DOWNLOAD_PROGRESS_PERCENT_STEP)
    : -1;

  logDownloadProgress(formatDownloadProgress(label, downloadedBytes, totalBytes, false));
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value === undefined) {
        continue;
      }
      if (!writer.write(value)) {
        await new Promise<void>((resolve, reject) => {
          const handleDrain = (): void => {
            writer.off('error', handleError);
            resolve();
          };
          const handleError = (error: Error): void => {
            writer.off('drain', handleDrain);
            reject(error);
          };
          writer.once('drain', handleDrain);
          writer.once('error', handleError);
        });
      }
      downloadedBytes += value.byteLength;

      const now = Date.now();
      const currentPercentStep = totalBytes !== null && totalBytes > 0
        ? Math.floor((downloadedBytes / totalBytes) * 100 / DOWNLOAD_PROGRESS_PERCENT_STEP)
        : -1;
      const shouldLog =
        now - lastLoggedAt >= DOWNLOAD_PROGRESS_LOG_INTERVAL_MS ||
        (totalBytes !== null && currentPercentStep > lastLoggedPercentStep);
      if (shouldLog) {
        logDownloadProgress(formatDownloadProgress(label, downloadedBytes, totalBytes, false));
        lastLoggedAt = now;
        lastLoggedPercentStep = currentPercentStep;
      }
    }
    await new Promise<void>((resolve, reject) => {
      const handleError = (error: Error): void => {
        reject(error);
      };
      writer.once('error', handleError);
      writer.end(() => {
        writer.off('error', handleError);
        resolve();
      });
    });
  } catch (error) {
    writer.destroy();
    flushActiveDownloadProgressLine();
    throw error;
  }

  if (finalizeProgress) {
    logDownloadProgress(formatDownloadProgress(label, downloadedBytes, totalBytes, true), true);
  }
}

function resumableDownloadStatePath(partialPath: string): string {
  return `${partialPath}.json`;
}

async function readResumableDownloadState(partialPath: string): Promise<ResumableDownloadState | null> {
  try {
    const contents = await fs.readFile(resumableDownloadStatePath(partialPath), 'utf8');
    return JSON.parse(contents) as ResumableDownloadState;
  } catch {
    return null;
  }
}

async function writeResumableDownloadState(partialPath: string, state: ResumableDownloadState): Promise<void> {
  await fs.writeFile(resumableDownloadStatePath(partialPath), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function removeResumableDownloadArtifacts(partialPath: string): Promise<void> {
  await fs.rm(partialPath, { force: true });
  await fs.rm(resumableDownloadStatePath(partialPath), { force: true });
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function matchesResumableDownloadState(
  state: ResumableDownloadState | null,
  expected: ResumableDownloadState,
): state is ResumableDownloadState {
  return (
    state !== null &&
    state.archiveName === expected.archiveName &&
    state.fileId === expected.fileId &&
    state.contentLength === expected.contentLength
  );
}

async function finalizeResumableDownload(
  partialPath: string,
  destinationPath: string,
  expectedLength: number,
): Promise<void> {
  const finalSize = await fileSizeIfExists(partialPath);
  if (finalSize !== expectedLength) {
    throw new Error(
      `Download finished with ${finalSize ?? 0} bytes, but ${expectedLength} bytes were expected.`,
    );
  }
  await fs.rename(partialPath, destinationPath);
  await fs.rm(resumableDownloadStatePath(partialPath), { force: true });
}

function isBinaryDownloadResponse(response: Response): boolean {
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  const contentDisposition = (response.headers.get('content-disposition') ?? '').toLowerCase();
  return (
    contentDisposition.includes('attachment') ||
    contentType.includes('application/octet-stream') ||
    contentType.includes('application/zip') ||
    contentType.includes('application/x-zip-compressed')
  );
}

async function downloadFileWithResume(
  destinationPath: string,
  state: ResumableDownloadState,
  verbose: boolean,
  options: {
    describe: string;
    maxRetries: number;
    request: (offset: number, chunkEnd: number) => Promise<DownloadRequestDefinition> | DownloadRequestDefinition;
  },
): Promise<void> {
  const partialPath = `${destinationPath}.part`;
  const existingState = await readResumableDownloadState(partialPath);
  if (!matchesResumableDownloadState(existingState, state)) {
    await removeResumableDownloadArtifacts(partialPath);
  }

  await ensureDir(path.dirname(destinationPath));
  await writeResumableDownloadState(partialPath, state);

  let consecutiveFailures = 0;
  while (true) {
    const offset = (await fileSizeIfExists(partialPath)) ?? 0;
    if (offset > state.contentLength) {
      await removeResumableDownloadArtifacts(partialPath);
      await writeResumableDownloadState(partialPath, state);
      continue;
    }
    if (offset === state.contentLength) {
      await finalizeResumableDownload(partialPath, destinationPath, state.contentLength);
      return;
    }

    const chunkEnd = Math.min(offset + CRS_DOWNLOAD_CHUNK_SIZE - 1, state.contentLength - 1);
    logVerbose(
      verbose,
      `${options.describe}: downloading CRS bytes ${offset}-${chunkEnd} of ${state.contentLength} (${state.archiveName})`,
    );

    try {
      const request = await options.request(offset, chunkEnd);
      const response = await fetch(request.url, {
        headers: request.headers,
      });
      if (!response.ok) {
        throw new Error(`Failed to download ${request.url}: ${response.status} ${response.statusText}`);
      }
      if (response.body === null) {
        throw new Error(`Download response did not contain a body: ${request.url}`);
      }
      if (!isBinaryDownloadResponse(response)) {
        throw new Error(
          `Expected a binary CRS download response, received status ${response.status} with content-type ${response.headers.get('content-type') ?? '<missing>'}.`,
        );
      }
      if (response.status !== 206) {
        throw new Error(`Expected HTTP 206 for CRS chunk download, received ${response.status}`);
      }

      const contentRange = response.headers.get('content-range');
      const expectedRangePrefix = `bytes ${offset}-`;
      if (!contentRange?.startsWith(expectedRangePrefix)) {
        throw new Error(`Resume response started at an unexpected offset: ${contentRange ?? '<missing>'}`);
      }

      await streamDownloadToFile(response, partialPath, {
        append: offset > 0,
        finalizeProgress: chunkEnd + 1 === state.contentLength,
        initialBytes: offset,
        label: state.archiveName,
        totalBytes: state.contentLength,
      });

      const currentSize = await fileSizeIfExists(partialPath);
      const expectedSize = chunkEnd + 1;
      if (currentSize !== expectedSize) {
        throw new Error(
          `CRS chunk write ended at ${currentSize ?? 0} bytes, but ${expectedSize} bytes were expected after this chunk.`,
        );
      }
      consecutiveFailures = 0;
      if (currentSize === state.contentLength) {
        await finalizeResumableDownload(partialPath, destinationPath, state.contentLength);
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const currentSize = (await fileSizeIfExists(partialPath)) ?? 0;
      consecutiveFailures += 1;
      if (consecutiveFailures >= options.maxRetries) {
        throw new Error(
          `${options.describe} failed after ${consecutiveFailures} consecutive attempts at ${currentSize} of ${state.contentLength} bytes: ${message}`,
        );
      }
      const delayMs = CRS_DOWNLOAD_RETRY_BASE_DELAY_MS * 2 ** (consecutiveFailures - 1);
      logVerbose(
        verbose,
        `${options.describe} attempt ${consecutiveFailures} failed at ${currentSize} of ${state.contentLength} bytes: ${message}. Retrying in ${delayMs}ms...`,
      );
      await sleep(delayMs);
    }
  }
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

async function readIcicleManifest(context: RuntimeContext): Promise<IcicleManifest> {
  const manifestPath = path.join(context.packageRoot, ICICLE_MANIFEST_PATH);
  const manifest = await readJsonFile<IcicleManifest>(manifestPath);
  if (manifest.version !== ICICLE_VERSION) {
    throw new Error(`ICICLE manifest ${manifestPath} has version ${manifest.version}, expected ${ICICLE_VERSION}.`);
  }
  return manifest;
}

function selectIcicleAsset(manifest: IcicleManifest, key: string): IcicleAsset {
  const asset = manifest.assets[key];
  const sha256 = normalizeSha256(asset?.sha256);
  if (asset === undefined || sha256 === null || !asset.fileName || !asset.url) {
    throw new Error(`ICICLE manifest is missing a valid asset entry for ${key}.`);
  }
  return {
    ...asset,
    sha256,
  };
}

async function downloadIcicleAssetWithCache(
  context: RuntimeContext,
  asset: IcicleAsset,
  verbose: boolean,
): Promise<string> {
  const cacheDir = path.join(context.platformDir, 'downloads', 'icicle', `v${ICICLE_VERSION}`);
  const archivePath = path.join(cacheDir, asset.fileName);
  if (await fileExists(archivePath)) {
    const actualHash = await sha256FileHex(archivePath);
    if (actualHash === asset.sha256) {
      logVerbose(verbose, `Using cached ICICLE archive ${archivePath}`);
      return archivePath;
    }
    logVerbose(verbose, `Discarding cached ICICLE archive ${archivePath}: SHA-256 mismatch.`);
    await fs.rm(archivePath, { force: true });
  }

  await downloadFile(asset.url, archivePath);
  const downloadedHash = await sha256FileHex(archivePath);
  if (downloadedHash !== asset.sha256) {
    await fs.rm(archivePath, { force: true });
    throw new Error(
      `Downloaded ICICLE archive ${asset.fileName} has SHA-256 ${downloadedHash}, expected ${asset.sha256}.`,
    );
  }
  return archivePath;
}

async function installIcicleRuntime(context: RuntimeContext, verbose: boolean): Promise<void> {
  const manifest = await readIcicleManifest(context);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-icicle-'));
  try {
    if (context.platform === 'macos') {
      const commonTarball = await downloadIcicleAssetWithCache(
        context,
        selectIcicleAsset(manifest, 'macos'),
        verbose,
      );
      const backendTarball = await downloadIcicleAssetWithCache(
        context,
        selectIcicleAsset(manifest, 'macos-metal'),
        verbose,
      );
      await extractTarArchive(commonTarball, tempRoot, verbose);
      await extractTarArchive(backendTarball, tempRoot, verbose);
    } else {
      const ubuntuMajor = await readLinuxUbuntuMajorVersion();
      const commonTarball = await downloadIcicleAssetWithCache(
        context,
        selectIcicleAsset(manifest, `ubuntu${ubuntuMajor}`),
        verbose,
      );
      await extractTarArchive(commonTarball, tempRoot, verbose);
      if (await linuxCudaBackendAvailable(verbose)) {
        const backendTarball = await downloadIcicleAssetWithCache(
          context,
          selectIcicleAsset(manifest, `ubuntu${ubuntuMajor}-cuda122`),
          verbose,
        );
        await extractTarArchive(backendTarball, tempRoot, verbose);
      }
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

function parseDriveArchiveName(name: string): Pick<DriveArchiveSelection, 'generatedAt' | 'version'> | null {
  const parsed = name.match(/v(\d+)\.(\d+)\.(\d+)-(\d{8}T\d{6}Z)\.zip$/iu);
  if (!parsed) {
    return null;
  }
  return {
    version: [Number(parsed[1]), Number(parsed[2]), Number(parsed[3])],
    generatedAt: parsed[4],
  };
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
      const parsedName = parseDriveArchiveName(node[2]);
      const sizeBytes = typeof node[13] === 'number' && Number.isFinite(node[13]) ? node[13] : null;
      if (parsedName && sizeBytes !== null && sizeBytes > 0) {
        entriesById.set(node[0], {
          fileId: node[0],
          name: node[2],
          version: parsedName.version,
          generatedAt: parsedName.generatedAt,
          sizeBytes,
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

async function crsArchiveCacheMatches(
  archivePath: string,
  selection: DriveArchiveSelection,
  verbose: boolean,
): Promise<boolean> {
  try {
    const archiveName = path.basename(archivePath);
    const parsedName = parseDriveArchiveName(archiveName);
    if (parsedName === null) {
      logVerbose(verbose, `Ignoring cached CRS archive ${archivePath}: archive name does not match the expected CRS naming convention.`);
      return false;
    }
    if (
      parsedName.generatedAt !== selection.generatedAt ||
      parsedName.version.some((part, index) => part !== selection.version[index])
    ) {
      logVerbose(
        verbose,
        `Ignoring cached CRS archive ${archivePath}: archive version ${parsedName.version.join('.')} at ${parsedName.generatedAt} does not match latest CRS ${selection.version.join('.')} at ${selection.generatedAt}.`,
      );
      return false;
    }

    const stats = await fs.stat(archivePath);
    if (!stats.isFile()) {
      logVerbose(verbose, `Ignoring cached CRS archive ${archivePath}: cached path is not a file.`);
      return false;
    }
    if (stats.size !== selection.sizeBytes) {
      logVerbose(
        verbose,
        `Ignoring cached CRS archive ${archivePath}: file size ${stats.size} does not match latest CRS size ${selection.sizeBytes}.`,
      );
      return false;
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logVerbose(verbose, `Ignoring cached CRS archive ${archivePath}: ${message}`);
    return false;
  }
}

async function downloadLatestCrsArchive(
  context: RuntimeContext,
  selection: DriveArchiveSelection,
  verbose: boolean,
): Promise<{ archivePath: string; archiveName: string }> {
  const url = driveDirectDownloadUrl(selection.fileId);
  const downloadDir = path.join(context.platformDir, 'downloads', 'crs');
  const archivePath = path.join(downloadDir, selection.name);
  if (await fileExists(archivePath)) {
    if (await crsArchiveCacheMatches(archivePath, selection, verbose)) {
      logVerbose(verbose, `Using cached CRS archive ${archivePath}`);
      return {
        archivePath,
        archiveName: selection.name,
      };
    }
    await fs.rm(archivePath, { force: true });
  }

  const resumableState = {
    archiveName: selection.name,
    contentLength: selection.sizeBytes,
    fileId: selection.fileId,
  };

  await downloadFileWithResume(
    archivePath,
    resumableState,
    verbose,
    {
      describe: 'Anonymous CRS download',
      maxRetries: CRS_DOWNLOAD_ANONYMOUS_MAX_RETRIES,
      request: (offset, chunkEnd) => ({
        url,
        headers: {
          Range: `bytes=${offset}-${chunkEnd}`,
        },
      }),
    },
  );
  if (!(await crsArchiveCacheMatches(archivePath, selection, verbose))) {
    await fs.rm(archivePath, { force: true });
    throw new Error(`Downloaded CRS archive ${selection.name} failed archive name and size validation.`);
  }
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

async function validateDownloadedCrsVersions(extractedDir: string, backendReleaseDir: string, archiveName: string): Promise<{
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

  for (const backendName of BACKEND_BINARY_NAMES) {
    const backendMetadataPath = path.join(backendReleaseDir, `build-metadata-${backendName}.json`);
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
  backendReleaseDir: string,
  verbose: boolean,
): Promise<void> {
  const paths = runtimePaths(context);
  const selection = await selectLatestDriveArchive();

  const extractedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tokamak-crs-extract-'));
  try {
    const { archivePath, archiveName } = await downloadLatestCrsArchive(context, selection, verbose);
    await extractZipArchive(archivePath, extractedDir, verbose);
    const { mpcMetadataPath, provenancePath } = await validateDownloadedCrsVersions(
      extractedDir,
      backendReleaseDir,
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
      await findNamedFile(extractedDir, 'sigma_verify.json'),
      path.join(paths.setupOutputDir, 'sigma_verify.json'),
    );
    await fs.copyFile(
      mpcMetadataPath,
      path.join(paths.setupOutputDir, 'build-metadata-mpc-setup.json'),
    );
    if (provenancePath !== null) {
      await fs.copyFile(provenancePath, path.join(paths.setupOutputDir, 'crs_provenance.json'));
    }
  } finally {
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

async function buildDockerInstallImage(
  context: RuntimeContext,
  environment: DockerEnvironment,
  imageName: string,
  verbose: boolean,
): Promise<void> {
  const dockerfilePath = path.join(context.packageRoot, DOCKERFILE_PATH);
  await fs.access(dockerfilePath);
  await runCommand(
    'docker',
    [
      'build',
      '--build-arg',
      `BASE_IMAGE=${dockerBaseImage(environment)}`,
      '-t',
      imageName,
      '-f',
      dockerfilePath,
      context.packageRoot,
    ],
    {
      verbose,
    },
  );
}

function dockerInstallArgs(context: RuntimeContext, bootstrap: DockerBootstrap, options: InstallOptions): string[] {
  const args = [
    ...dockerRunPrefix(bootstrap),
    ...dockerUserArgs(),
    '-v',
    `${context.cacheRoot}:${DOCKER_CONTAINER_CACHE_ROOT}`,
    '-e',
    `TOKAMAK_ZKEVM_CLI_CACHE_DIR=${DOCKER_CONTAINER_CACHE_ROOT}`,
    '-e',
    'HOME=/tmp',
    bootstrap.imageName,
    '--install',
  ];
  if (options.trustedSetup) {
    args.push('--trusted-setup');
  }
  if (options.noSetup) {
    args.push('--no-setup');
  }
  if (options.verbose) {
    args.push('--verbose');
  }
  return args;
}

async function writeRuntimeState(context: RuntimeContext, state: RuntimeState): Promise<void> {
  await ensureDir(path.dirname(context.statePath));
  await fs.writeFile(context.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function installDockerRuntime(options: InstallOptions): Promise<RuntimeContext> {
  const context = await createRuntimeContext();
  if (context.platform !== 'linux') {
    throw new Error('`tokamak-cli --install --docker` is supported only on Linux hosts.');
  }
  await ensureDockerDaemonAvailable(options.verbose);
  await ensureDir(context.cacheRoot);

  const dockerEnvironment: DockerEnvironment = (await dockerCudaAvailable(options.verbose))
    ? 'ubuntu22-cuda122'
    : 'ubuntu22';
  const bootstrap: DockerBootstrap = {
    version: DOCKER_BOOTSTRAP_VERSION,
    createdAt: new Date().toISOString(),
    dockerEnvironment,
    imageName: dockerImageName(context.packageVersion, dockerEnvironment),
    packageVersion: context.packageVersion,
    platform: 'linux',
    useGpus: dockerEnvironment === 'ubuntu22-cuda122',
  };

  await buildDockerInstallImage(context, dockerEnvironment, bootstrap.imageName, options.verbose);
  await runCommand('docker', dockerInstallArgs(context, bootstrap, options), {
    verbose: options.verbose,
  });
  await writeDockerBootstrap(context, bootstrap);
  await writeRuntimeState(context, {
    dockerEnvironment,
    installMode: 'docker',
    packageVersion: context.packageVersion,
    platform: context.platform,
    installedAt: bootstrap.createdAt,
  });
  return context;
}

export async function installRuntime(options: InstallOptions): Promise<RuntimeContext> {
  if (options.docker) {
    return await installDockerRuntime(options);
  }

  const context = await createRuntimeContext();
  ensureInstallPrerequisites(context.platform, options);
  const backendRoot = await ensureVendoredBackendExists(context.packageRoot);

  logVerbose(options.verbose, `Using vendored backend ${backendRoot}`);
  await emptyDir(context.runtimeDir);
  const backendReleaseDir = await buildBackendReleaseBinaries(backendRoot, options);
  logVerbose(options.verbose, `Using backend release output ${backendReleaseDir}`);
  await copyBuiltBackendBinaries(context, backendReleaseDir, options);
  await installIcicleRuntime(context, options.verbose);
  await configureMacosRuntime(context, options.verbose);

  if (options.noSetup) {
    await writeSkippedSetupNotice(context);
  } else if (options.trustedSetup) {
    await runTrustedSetup(context, options.verbose);
  } else {
    await installDownloadedSetup(context, backendReleaseDir, options.verbose);
  }

  const state: RuntimeState = {
    installMode: 'native',
    packageVersion: context.packageVersion,
    platform: context.platform,
    installedAt: new Date().toISOString(),
  };
  await writeRuntimeState(context, state);
  return context;
}

export async function uninstallRuntime(): Promise<RuntimeContext> {
  const context = await createRuntimeContext();
  await fs.rm(context.platformDir, { recursive: true, force: true });
  await removeDirectoryIfEmpty(context.cacheRoot);
  return context;
}
