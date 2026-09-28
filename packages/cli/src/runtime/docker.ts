import path from 'node:path';
import fs from 'node:fs/promises';
import {
  backendEnvironment,
  createDockerRuntimeContext,
  ensureDir,
  runtimePaths,
} from './context.js';
import { validateBackendRuntimeIdentityForContext } from './identity.js';
import { BACKEND_PACKAGE_NAMES } from '../generated/backend-build-metadata-validator.generated.js';
import { commitPreparedRuntime } from './transaction.js';
import type {
  DockerBootstrap,
  DockerEnvironment,
  InstalledRuntime,
  InstallOptions,
  RuntimeContext,
  RuntimeExecution,
} from './model.js';
import {
  commandExists,
  commandSucceeds,
  logVerbose,
  runCommand,
  type CommandResult,
} from '../system.js';

const DOCKER_BOOTSTRAP_VERSION = 1;

const DOCKER_CONTAINER_CACHE_ROOT = '/tokamak-cache';

const DOCKER_CUDA_PROBE_IMAGE = 'nvidia/cuda:12.2.0-base-ubuntu22.04';

const DOCKER_CUDA_BASE_IMAGE = 'nvidia/cuda:12.2.0-devel-ubuntu22.04';

const DOCKER_CUDA_MIN_DRIVER_VERSION = '525.60.13';

const DOCKER_UBUNTU_BASE_IMAGE = 'ubuntu:22.04';

const DOCKERFILE_PATH = path.join('docker', 'Dockerfile');

function dockerBootstrapDir(context: RuntimeContext): string {
  return path.join(context.platformDir, 'docker');
}

function dockerBootstrapPath(context: RuntimeContext): string {
  return path.join(dockerBootstrapDir(context), 'bootstrap.json');
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

function parseVersionParts(version: string): number[] | null {
  const parts = version.trim().split('.');
  if (parts.length === 0) {
    return null;
  }
  const parsed = parts.map((part) => Number.parseInt(part, 10));
  return parsed.every((part) => Number.isFinite(part)) ? parsed : null;
}

function versionAtLeast(actual: string, minimum: string): boolean {
  const actualParts = parseVersionParts(actual);
  const minimumParts = parseVersionParts(minimum);
  if (actualParts === null || minimumParts === null) {
    return false;
  }
  const length = Math.max(actualParts.length, minimumParts.length);
  for (let index = 0; index < length; index += 1) {
    const actualPart = actualParts[index] ?? 0;
    const minimumPart = minimumParts[index] ?? 0;
    if (actualPart !== minimumPart) {
      return actualPart > minimumPart;
    }
  }
  return true;
}

async function dockerCudaAvailable(verbose: boolean): Promise<boolean> {
  const args = [
    'run',
    '--rm',
    '--gpus',
    'all',
    DOCKER_CUDA_PROBE_IMAGE,
    'nvidia-smi',
    '--query-gpu=name,driver_version',
    '--format=csv,noheader',
  ];
  try {
    const result = await runCommand('docker', args, { quiet: !verbose, verbose });
    const detectedDevices = result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (detectedDevices.length === 0) {
      logVerbose(verbose, 'Docker CUDA probe did not report any NVIDIA devices; using CPU-only Ubuntu 22 environment.');
      return false;
    }
    for (const device of detectedDevices) {
      const parts = device.split(',').map((part) => part.trim());
      const driverVersion = parts.at(-1) ?? '';
      if (!versionAtLeast(driverVersion, DOCKER_CUDA_MIN_DRIVER_VERSION)) {
        logVerbose(
          verbose,
          `Docker CUDA probe found driver ${driverVersion || '<unknown>'}, but CUDA 12.2 requires ${DOCKER_CUDA_MIN_DRIVER_VERSION} or newer; using CPU-only Ubuntu 22 environment.`,
        );
        return false;
      }
    }
    logVerbose(verbose, `Docker CUDA probe succeeded for detected NVIDIA device(s): ${detectedDevices.join('; ')}`);
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

function dockerRunPrefix(bootstrap: DockerBootstrap, useGpus = bootstrap.useGpus): string[] {
  const args = ['run', '--rm'];
  if (useGpus) {
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
    (candidate.dockerEnvironment !== 'ubuntu22' && candidate.dockerEnvironment !== 'ubuntu22-cuda122') ||
    candidate.useGpus !== (candidate.dockerEnvironment === 'ubuntu22-cuda122')
  ) {
    return null;
  }
  return candidate as DockerBootstrap;
}

async function readDockerBootstrap(context: RuntimeContext): Promise<DockerBootstrap> {
  if (context.platform !== 'linux') {
    throw new Error('Docker execution requires a Linux runtime context.');
  }
  const bootstrapPath = dockerBootstrapPath(context);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(bootstrapPath, 'utf8')) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Docker runtime is selected, but its bootstrap is unavailable at ${bootstrapPath}: ${message}. Run \`tokamak-cli --install --docker\` again.`,
    );
  }
  const bootstrap = validateDockerBootstrap(parsed);
  if (bootstrap === null) {
    throw new Error(
      `Docker runtime is selected, but its bootstrap at ${bootstrapPath} is invalid. Run \`tokamak-cli --install --docker\` again.`,
    );
  }
  return bootstrap;
}

function assertBootstrapMatchesInstalledRuntime(installed: InstalledRuntime, bootstrap: DockerBootstrap): void {
  const { context, state } = installed;
  if (state.installMode !== 'docker') {
    throw new Error('Internal error: Docker bootstrap validation requires a Docker-selected runtime.');
  }
  const expectedEnvironment = state.dockerEnvironment;
  const expectedImageName = dockerImageName(context.packageVersion, expectedEnvironment);
  if (bootstrap.packageVersion !== context.packageVersion) {
    throw new Error(
      `Docker bootstrap package version ${bootstrap.packageVersion} does not match current CLI package version ${context.packageVersion}. Run \`tokamak-cli --install --docker\` again.`,
    );
  }
  if (bootstrap.dockerEnvironment !== expectedEnvironment) {
    throw new Error(
      `Docker bootstrap environment ${bootstrap.dockerEnvironment} does not match selected runtime environment ${expectedEnvironment}. Run \`tokamak-cli --install --docker\` again.`,
    );
  }
  if (bootstrap.imageName !== expectedImageName) {
    throw new Error(
      `Docker bootstrap image ${bootstrap.imageName} does not match expected image ${expectedImageName}. Run \`tokamak-cli --install --docker\` again.`,
    );
  }
}

export async function resolveRuntimeExecution(installed: InstalledRuntime): Promise<RuntimeExecution> {
  if (installed.state.installMode === 'native') {
    return { mode: 'native', context: installed.context, state: installed.state };
  }
  const bootstrap = await readDockerBootstrap(installed.context);
  assertBootstrapMatchesInstalledRuntime(installed, bootstrap);
  return { mode: 'docker', context: installed.context, state: installed.state, bootstrap };
}

async function runDockerBootstrapCommand(
  context: RuntimeContext,
  bootstrap: DockerBootstrap,
  command: string,
  args: string[],
  verbose: boolean,
  quiet = false,
  suppressStdout = false,
  useGpus = bootstrap.useGpus,
): Promise<CommandResult> {
  const env = dockerBackendEnvironment(context);
  const containerCommand = toContainerPath(command, context);
  const dockerArgs = [
    ...dockerRunPrefix(bootstrap, useGpus),
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
  return await runCommand('docker', dockerArgs, { quiet, suppressStdout, verbose });
}

export async function runBackendCommand(
  execution: RuntimeExecution,
  command: string,
  args: string[],
  verbose: boolean,
  options: {
    quiet?: boolean;
    suppressStdout?: boolean;
  } = {},
): Promise<CommandResult> {
  const { quiet = false, suppressStdout = false } = options;
  const { context } = execution;
  if (execution.mode === 'docker') {
    const { bootstrap } = execution;
    if (!(await dockerDaemonAvailable(verbose))) {
      if (process.platform === 'win32') {
        throw new Error('Docker Desktop is required to run the selected Tokamak zk-EVM Docker runtime on Windows.');
      }
      logVerbose(verbose, 'Docker is unavailable; running the selected Docker runtime through its native Linux fallback.');
      return await runCommand(command, args, {
        env: backendEnvironment(context),
        quiet,
        suppressStdout,
        verbose,
      });
    }
    if (!(await commandSucceeds('docker', ['image', 'inspect', bootstrap.imageName]))) {
      throw new Error(
        `Tokamak zk-EVM Docker image ${bootstrap.imageName} is missing. Run \`tokamak-cli --install --docker\` again.`,
      );
    }
    let useGpus = bootstrap.useGpus;
    if (useGpus && !(await dockerCudaAvailable(verbose))) {
      logVerbose(verbose, 'Docker CUDA bootstrap is installed, but CUDA is not currently available; running without `--gpus all`.');
      useGpus = false;
    }
    logVerbose(
      verbose,
      `Running backend command in Docker bootstrap ${bootstrap.dockerEnvironment}${useGpus ? ' with CUDA' : ' without CUDA'}.`,
    );
    return await runDockerBootstrapCommand(context, bootstrap, command, args, verbose, quiet, suppressStdout, useGpus);
  }

  return await runCommand(command, args, {
    env: backendEnvironment(context),
    quiet,
    suppressStdout,
    verbose,
  });
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

function dockerPrepareArgs(
  context: RuntimeContext,
  bootstrap: DockerBootstrap,
  stagingRoot: string,
  options: InstallOptions,
): string[] {
  const args = [
    ...dockerRunPrefix(bootstrap),
    ...dockerUserArgs(),
    '-v',
    `${context.cacheRoot}:${DOCKER_CONTAINER_CACHE_ROOT}`,
    '-e',
    `TOKAMAK_ZKEVM_CLI_CACHE_DIR=${DOCKER_CONTAINER_CACHE_ROOT}`,
    '-e',
    'HOME=/tmp',
    '--entrypoint',
    'node',
    bootstrap.imageName,
    '/opt/tokamak-cli/dist/prepare-runtime.js',
    '--staging-root',
    toContainerPath(stagingRoot, context),
  ];
  if (options.noFullSetup) {
    args.push('--no-full-setup');
  }
  if (options.verbose) {
    args.push('--verbose');
  }
  return args;
}

export async function installDockerRuntime(options: InstallOptions): Promise<RuntimeContext> {
  const context = await createDockerRuntimeContext();
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
  const stagingRoot = await fs.mkdtemp(path.join(context.platformDir, '.docker-runtime-staging-'));
  const stagingContext = { ...context, runtimeDir: path.join(stagingRoot, 'runtime') };
  const stagingIdentityPath = path.join(stagingRoot, 'backend-runtime-identity.json');
  const stagingBootstrapPath = path.join(stagingRoot, 'bootstrap.json');
  try {
    await runCommand('docker', dockerPrepareArgs(context, bootstrap, stagingRoot, options), {
      verbose: options.verbose,
    });
    const backendRuntimeIdentity = validateBackendRuntimeIdentityForContext(
      JSON.parse(await fs.readFile(stagingIdentityPath, 'utf8')) as unknown,
      context,
      'Docker backend runtime identity',
    );
    await validatePreparedDockerRuntime(stagingContext, options.noFullSetup);
    await fs.writeFile(stagingBootstrapPath, `${JSON.stringify(bootstrap, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    await commitPreparedRuntime(
      context,
      stagingContext,
      {
        backendRuntimeIdentity,
        dockerEnvironment,
        installMode: 'docker',
        packageVersion: context.packageVersion,
        platform: context.platform,
        installedAt: bootstrap.createdAt,
      },
      [{ activePath: dockerBootstrapPath(context), stagingPath: stagingBootstrapPath }],
    );
    await fs.rm(path.join(dockerBootstrapDir(context), 'run.sh'), { force: true });
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true });
  }
  return context;
}

async function validatePreparedDockerRuntime(context: RuntimeContext, noFullSetup: boolean): Promise<void> {
  const paths = runtimePaths(context);
  const runtimeStat = await fs.stat(context.runtimeDir);
  if (!runtimeStat.isDirectory()) {
    throw new Error(`Docker-prepared runtime is not a directory: ${context.runtimeDir}`);
  }
  for (const packageName of BACKEND_PACKAGE_NAMES) {
    const binaryStat = await fs.stat(path.join(paths.binaryDir, packageName));
    if (!binaryStat.isFile()) {
      throw new Error(`Docker-prepared runtime is missing backend binary ${packageName}.`);
    }
  }
  const icicleStat = await fs.stat(paths.icicleLibDir);
  if (!icicleStat.isDirectory()) {
    throw new Error('Docker-prepared runtime is missing the ICICLE library directory.');
  }
  for (const name of noFullSetup
    ? ['verifier_keys.rkyv', 'crs_provenance.json']
    : ['verifier_keys.rkyv', 'crs_provenance.json', 'prover_keys.rkyv', 'preprocess_keys.rkyv', 'tau_sequence.rkyv']) {
    if (!(await fs.stat(path.join(paths.setupOutputDir, name))).isFile()) {
      throw new Error(`Docker-prepared runtime is missing CRS file ${name}.`);
    }
  }
}
