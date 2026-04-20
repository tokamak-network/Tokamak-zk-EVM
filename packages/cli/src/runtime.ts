import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { spawn } from 'node:child_process';

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

const CACHE_DIR_ENV = 'TOKAMAK_ZKEVM_CLI_CACHE_DIR';

function logVerbose(enabled: boolean, message: string): void {
  if (enabled) {
    console.error(`[info] ${message}`);
  }
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export function detectPlatform(): CliPlatform {
  switch (process.platform) {
    case 'darwin':
      return 'macos';
    case 'linux':
      return 'linux';
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
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

function resolveVendoredWorkspaceRoot(packageRoot: string): string {
  return path.join(packageRoot, 'vendor', 'workspace');
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

function resolveInstalledPackageDir(packageRoot: string, packageName: string): string {
  const packageSegments = packageName.split('/');
  let current = packageRoot;
  while (true) {
    const candidate = path.join(current, 'node_modules', ...packageSegments);
    if (fsSync.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Failed to locate an installed node_modules directory for ${packageName}.`);
    }
    current = parent;
  }
}

async function ensureVendoredWorkspaceExists(packageRoot: string): Promise<string> {
  const workspaceRoot = resolveVendoredWorkspaceRoot(packageRoot);
  const packagingScript = path.join(workspaceRoot, 'scripts', 'packaging.sh');
  try {
    await fs.access(packagingScript);
  } catch {
    throw new Error(
      'The vendored backend workspace is missing. Rebuild the package so that vendor/workspace is populated.',
    );
  }
  return workspaceRoot;
}

export async function installRuntime(options: InstallOptions): Promise<RuntimeContext> {
  const context = await createRuntimeContext();
  const workspaceRoot = await ensureVendoredWorkspaceExists(context.packageRoot);

  const packagingScript = path.join(workspaceRoot, 'scripts', 'packaging.sh');
  const args = [
    packagingScript,
    context.platform === 'macos' ? '--macos' : '--linux',
    '--target-dir',
    context.runtimeDir,
  ];
  if (options.noSetup) {
    args.push('--no-setup');
  } else if (options.trustedSetup) {
    args.push('--trusted-setup');
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TOKAMAK_ZKEVM_SUBCIRCUIT_PACKAGE_DIR: resolveInstalledPackageDir(
      context.packageRoot,
      '@tokamak-zk-evm/subcircuit-library',
    ),
    TOKAMAK_ZKEVM_SYNTHESIZER_PACKAGE_DIR: resolveInstalledPackageDir(
      context.packageRoot,
      '@tokamak-zk-evm/synthesizer-node',
    ),
  };

  logVerbose(options.verbose, `Using vendored workspace ${workspaceRoot}`);
  await ensureDir(context.platformDir);
  await emptyDir(context.runtimeDir);
  await runCommand('bash', args, {
    cwd: workspaceRoot,
    env,
    verbose: options.verbose,
  });

  const state: RuntimeState = {
    packageVersion: context.packageVersion,
    platform: context.platform,
    installedAt: new Date().toISOString(),
  };
  await fs.writeFile(context.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return context;
}
