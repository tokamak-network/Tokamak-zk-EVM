import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  compatibilityFromPackageVersion,
  parseCompatibleBackendVersion,
} from '../generated/version-policy.generated.js';
import {
  parseBackendRuntimeIdentity,
  validateBackendRuntimeIdentityForContext,
} from './identity.js';
import type {
  CliPlatform,
  DockerEnvironment,
  InstalledRuntime,
  RuntimeContext,
  RuntimeState,
} from './model.js';

type DockerHostPlatform = 'linux' | 'windows';

const CACHE_DIR_ENV = 'TOKAMAK_ZKEVM_CLI_CACHE_DIR';

export function detectPlatform(): CliPlatform {
  switch (process.platform) {
    case 'darwin':
      return 'macos';
    case 'linux':
      return 'linux';
    default:
      throw new Error(
        `Unsupported platform: ${process.platform}. Native tokamak-cli installs currently support only macOS and Linux. Use WSL2 or Docker Desktop with \`--install --docker\` on Windows.`,
      );
  }
}

function detectDockerHostPlatform(): DockerHostPlatform {
  switch (process.platform) {
    case 'linux':
      return 'linux';
    case 'win32':
      return 'windows';
    case 'darwin':
      throw new Error('`tokamak-cli --install --docker` is not supported on macOS hosts.');
    default:
      throw new Error(
        `Unsupported Docker host platform: ${process.platform}. Use Linux or Windows with Docker Desktop.`,
      );
  }
}

export function resolveCacheRoot(): string {
  const configured = process.env[CACHE_DIR_ENV]?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.join(os.homedir(), '.tokamak-zk-evm');
}

export function resolvePackageRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

export function normalizeCompatibleBackendVersion(value: string, label: string): string {
  try {
    return parseCompatibleBackendVersion(value);
  } catch (error) {
    throw new Error(`${label} ${versionPolicyMessage(error)}`);
  }
}

export function packageCompatibleVersion(packageVersion: string, label: string): string {
  try {
    return compatibilityFromPackageVersion(packageVersion);
  } catch (error) {
    throw new Error(`${label} ${versionPolicyMessage(error)}`);
  }
}

function versionPolicyMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function resolvePackageMetadata(packageRoot: string): Promise<{
  compatibleBackendVersion: string;
  packageVersion: string;
}> {
  const manifestPath = path.join(packageRoot, 'package.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
    tokamakZkEvm?: {
      compatibleBackendVersion?: string;
    };
    version?: string;
  };
  if (!manifest.version) {
    throw new Error(`Package version is missing from ${manifestPath}.`);
  }
  const configuredCompatibleVersion = manifest.tokamakZkEvm?.compatibleBackendVersion;
  if (!configuredCompatibleVersion) {
    throw new Error(`Compatible backend version is missing from ${manifestPath}.`);
  }
  const packageVersion = manifest.version;
  const compatibleBackendVersion = normalizeCompatibleBackendVersion(
    configuredCompatibleVersion,
    `${manifestPath} tokamakZkEvm.compatibleBackendVersion`,
  );
  const expectedCompatibleVersion = packageCompatibleVersion(packageVersion, `${manifestPath} version`);
  if (compatibleBackendVersion !== expectedCompatibleVersion) {
    throw new Error(
      `${manifestPath} compatible backend version ${compatibleBackendVersion} must match package major.minor ${expectedCompatibleVersion}.`,
    );
  }
  return { compatibleBackendVersion, packageVersion };
}

async function createRuntimeContextForPlatform(platform: CliPlatform): Promise<RuntimeContext> {
  const packageRoot = resolvePackageRoot();
  const { compatibleBackendVersion, packageVersion } = await resolvePackageMetadata(packageRoot);
  const cacheRoot = resolveCacheRoot();
  const platformDir = path.join(cacheRoot, platform);
  return {
    cacheRoot,
    packageRoot,
    platform,
    platformDir,
    runtimeDir: path.join(platformDir, 'runtime'),
    statePath: path.join(platformDir, 'installation.json'),
    compatibleBackendVersion,
    packageVersion,
  };
}

export async function createRuntimeContext(): Promise<RuntimeContext> {
  return await createRuntimeContextForPlatform(detectPlatform());
}

export async function createDockerRuntimeContext(): Promise<RuntimeContext> {
  detectDockerHostPlatform();
  return await createRuntimeContextForPlatform('linux');
}

export async function readInstalledState(platform: CliPlatform): Promise<RuntimeState | null> {
  const statePath = path.join(resolveCacheRoot(), platform, 'installation.json');
  let contents: string;
  try {
    contents = await fs.readFile(statePath, 'utf8');
  } catch (error) {
    if (isMissingPathError(error)) {
      return null;
    }
    throw new Error(`Unable to read installed runtime state at ${statePath}: ${errorMessage(error)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents) as unknown;
  } catch (error) {
    throw new Error(`Installed runtime state at ${statePath} is invalid JSON: ${errorMessage(error)}`);
  }
  return parseInstalledRuntimeState(parsed, statePath);
}

export function parseInstalledRuntimeState(value: unknown, label = 'installed runtime state'): RuntimeState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const candidate = value as Partial<RuntimeState>;
  if (candidate.installMode !== 'native' && candidate.installMode !== 'docker') {
    throw new Error(`${label} installMode must be "native" or "docker".`);
  }
  if (typeof candidate.packageVersion !== 'string' || candidate.packageVersion.length === 0) {
    throw new Error(`${label} packageVersion must be a non-empty string.`);
  }
  packageCompatibleVersion(candidate.packageVersion, `${label} packageVersion`);
  if (candidate.platform !== 'linux' && candidate.platform !== 'macos') {
    throw new Error(`${label} platform must be "linux" or "macos".`);
  }
  if (typeof candidate.installedAt !== 'string' || Number.isNaN(Date.parse(candidate.installedAt))) {
    throw new Error(`${label} installedAt must be an ISO-8601 timestamp.`);
  }
  if (candidate.installMode === 'native' && candidate.dockerEnvironment !== undefined) {
    throw new Error(`${label} dockerEnvironment is only valid for a Docker runtime.`);
  }
  if (candidate.installMode === 'docker' && !isDockerEnvironment(candidate.dockerEnvironment)) {
    throw new Error(`${label} Docker runtime must include a supported dockerEnvironment.`);
  }
  const backendRuntimeIdentity = parseBackendRuntimeIdentity(
    candidate.backendRuntimeIdentity,
    `${label}.backendRuntimeIdentity`,
  );
  return { ...candidate, backendRuntimeIdentity } as RuntimeState;
}

export function assertInstalledRuntimeMatchesContext(
  context: RuntimeContext,
  state: RuntimeState,
  acceptedInstallModes: readonly RuntimeState['installMode'][],
): void {
  if (state.packageVersion !== context.packageVersion) {
    throw new Error(
      `Installed runtime package version ${state.packageVersion} does not match current CLI package version ${context.packageVersion}.`,
    );
  }
  if (state.platform !== context.platform) {
    throw new Error(
      `Installed runtime platform ${state.platform} does not match current CLI platform ${context.platform}.`,
    );
  }
  if (!acceptedInstallModes.includes(state.installMode)) {
    throw new Error(
      `Installed runtime mode ${state.installMode} is not supported for the current CLI execution path.`,
    );
  }
  validateBackendRuntimeIdentityForContext(
    state.backendRuntimeIdentity,
    context,
    'Installed backend runtime identity',
  );
}

function isDockerEnvironment(value: unknown): value is DockerEnvironment {
  return value === 'ubuntu22' || value === 'ubuntu22-cuda122';
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function installedRuntimeInstallHint(docker: boolean): string {
  return docker ? 'tokamak-cli --install --docker' : 'tokamak-cli --install';
}

function installedRuntimeError(docker: boolean, detail?: string): Error {
  const suffix = detail === undefined ? '' : ` ${detail}`;
  return new Error(
    `Tokamak zk-EVM runtime is not installed for the current CLI package.${suffix} Run \`${installedRuntimeInstallHint(docker)}\` first.`,
  );
}

function validateInstalledRuntime(
  context: RuntimeContext,
  state: RuntimeState | null,
  acceptedInstallModes: readonly RuntimeState['installMode'][],
  docker: boolean,
): RuntimeState {
  if (state === null) {
    throw installedRuntimeError(docker);
  }
  try {
    assertInstalledRuntimeMatchesContext(context, state, acceptedInstallModes);
  } catch (error) {
    throw installedRuntimeError(docker, errorMessage(error));
  }
  return state;
}

function nativeHostInstallModes(context: RuntimeContext): readonly RuntimeState['installMode'][] {
  if (context.platform === 'macos') {
    return ['native'];
  }
  return ['native', 'docker'];
}

export async function requireInstalledRuntimeState(): Promise<InstalledRuntime> {
  if (process.platform === 'win32') {
    const context = await createDockerRuntimeContext();
    const state = await readInstalledState(context.platform);
    const validatedState = validateInstalledRuntime(context, state, ['docker'], true);
    await fs.access(context.runtimeDir);
    return { context, state: validatedState };
  }

  const context = await createRuntimeContext();
  const state = await readInstalledState(context.platform);
  const validatedState = validateInstalledRuntime(context, state, nativeHostInstallModes(context), false);
  await fs.access(context.runtimeDir);
  return { context, state: validatedState };
}

export async function removeDirectoryIfEmpty(target: string): Promise<void> {
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
  };
}

export async function ensureDir(dirPath: string): Promise<void> {
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

export async function writeRuntimeState(context: RuntimeContext, state: RuntimeState): Promise<void> {
  await ensureDir(path.dirname(context.statePath));
  await fs.writeFile(context.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}
