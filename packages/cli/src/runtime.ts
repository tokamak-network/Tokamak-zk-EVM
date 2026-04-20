import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';

export type CliPlatform = 'linux' | 'macos';

export interface InstallOptions {
  noSetup: boolean;
  trustedSetup: boolean;
  verbose: boolean;
}

export interface RuntimeState {
  releaseTag: string;
  platform: CliPlatform;
  installedAt: string;
}

export interface RuntimeContext {
  cacheRoot: string;
  platform: CliPlatform;
  platformDir: string;
  runtimeDir: string;
  statePath: string;
  releaseTag: string;
}

interface GitHubReleaseAsset {
  name: string;
}

interface GitHubRelease {
  tag_name?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GitHubReleaseAsset[];
}

const REPO_OWNER = 'tokamak-network';
const REPO_NAME = 'Tokamak-zk-EVM';
const RELEASE_TAG_ENV = 'TOKAMAK_ZKEVM_RELEASE_TAG';
const CACHE_DIR_ENV = 'TOKAMAK_ZKEVM_CLI_CACHE_DIR';

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

export function createRuntimeContext(releaseTag: string): RuntimeContext {
  const platform = detectPlatform();
  const cacheRoot = resolveCacheRoot();
  const platformDir = path.join(cacheRoot, platform);
  return {
    cacheRoot,
    platform,
    platformDir,
    runtimeDir: path.join(platformDir, 'runtime'),
    statePath: path.join(platformDir, 'installation.json'),
    releaseTag,
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
  const platform = detectPlatform();
  const state = await readInstalledState(platform);
  if (state === null) {
    throw new Error('Tokamak zk-EVM runtime is not installed. Run `tokamak-cli --install` first.');
  }

  const context = createRuntimeContext(state.releaseTag);
  await fs.access(context.runtimeDir);
  return context;
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

export function assetNameForPlatform(releaseTag: string, platform: CliPlatform): string {
  return platform === 'macos'
    ? `tokamak-zk-evm-${releaseTag}-macos.zip`
    : `tokamak-zk-evm-${releaseTag}-linux22.tar.gz`;
}

export function setupAssetName(releaseTag: string): string {
  return `tokamak-zk-evm-${releaseTag}-setup-files.tar.gz`;
}

async function fetchGitHubRelease(url: string): Promise<GitHubRelease> {
  const response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': '@tokamak-zk-evm/cli',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to resolve GitHub release metadata: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as GitHubRelease;
}

async function fetchGitHubReleases(url: string): Promise<GitHubRelease[]> {
  const response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': '@tokamak-zk-evm/cli',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to resolve GitHub releases: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as GitHubRelease[];
}

function releaseHasRequiredAssets(
  release: GitHubRelease,
  platform: CliPlatform,
  requireSetupAsset: boolean,
): boolean {
  const releaseTag = release.tag_name?.trim();
  if (!releaseTag) {
    return false;
  }

  const assetNames = new Set((release.assets ?? []).map((asset) => asset.name));
  if (!assetNames.has(assetNameForPlatform(releaseTag, platform))) {
    return false;
  }

  if (requireSetupAsset && !assetNames.has(setupAssetName(releaseTag))) {
    return false;
  }

  return true;
}

export async function resolveReleaseTag(
  verbose: boolean,
  options: {
    platform: CliPlatform;
    requireSetupAsset: boolean;
  },
): Promise<string> {
  const pinned = process.env[RELEASE_TAG_ENV]?.trim();
  if (pinned) {
    const release = await fetchGitHubRelease(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/${pinned}`,
    );
    if (!releaseHasRequiredAssets(release, options.platform, options.requireSetupAsset)) {
      throw new Error(
        `Pinned release ${pinned} does not contain the required runtime assets for ${options.platform}.`,
      );
    }
    logVerbose(verbose, `Using pinned release tag from ${RELEASE_TAG_ENV}: ${pinned}`);
    return pinned;
  }

  const releases = await fetchGitHubReleases(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases?per_page=30`,
  );

  const stableCandidate = releases.find(
    (release) =>
      !release.draft &&
      !release.prerelease &&
      releaseHasRequiredAssets(release, options.platform, options.requireSetupAsset),
  );
  const prereleaseCandidate = releases.find(
    (release) =>
      !release.draft &&
      release.prerelease &&
      releaseHasRequiredAssets(release, options.platform, options.requireSetupAsset),
  );
  const selected = stableCandidate ?? prereleaseCandidate;

  if (!selected?.tag_name) {
    throw new Error(
      `Failed to find a GitHub release containing the required runtime assets for ${options.platform}.`,
    );
  }
  logVerbose(verbose, `Resolved GitHub release tag: ${selected.tag_name}`);
  return selected.tag_name;
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function emptyDir(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
  await fs.mkdir(dirPath, { recursive: true });
}

async function downloadFile(url: string, destination: string, verbose: boolean): Promise<void> {
  logVerbose(verbose, `Downloading ${url}`);
  const response = await fetch(url, {
    headers: {
      'user-agent': '@tokamak-zk-evm/cli',
    },
    redirect: 'follow',
  });
  if (!response.ok || response.body === null) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  await ensureDir(path.dirname(destination));
  await new Promise<void>((resolve, reject) => {
    const fileStream = createWriteStream(destination);
    const bodyStream = Readable.fromWeb(response.body as globalThis.ReadableStream<Uint8Array>);
    bodyStream.on('error', reject);
    fileStream.on('error', reject);
    fileStream.on('finish', () => resolve());
    bodyStream.pipe(fileStream);
  });
}

export interface CommandResult {
  stdout: string;
  stderr: string;
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

async function extractZip(archivePath: string, destination: string, verbose: boolean): Promise<void> {
  await ensureDir(destination);
  await runCommand('unzip', ['-q', archivePath, '-d', destination], { verbose });
}

async function extractTarGz(archivePath: string, destination: string, verbose: boolean): Promise<void> {
  await ensureDir(destination);
  await runCommand('tar', ['-xzf', archivePath, '-C', destination], { verbose });
}

function releaseDownloadUrl(releaseTag: string, assetName: string): string {
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${releaseTag}/${assetName}`;
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

async function installSetupArchive(context: RuntimeContext, verbose: boolean): Promise<void> {
  const paths = runtimePaths(context);
  await emptyDir(paths.setupOutputDir);
  const archivePath = path.join(context.platformDir, setupAssetName(context.releaseTag));
  await downloadFile(releaseDownloadUrl(context.releaseTag, setupAssetName(context.releaseTag)), archivePath, verbose);
  await extractTarGz(archivePath, paths.setupOutputDir, verbose);
}

async function runTrustedSetup(context: RuntimeContext, verbose: boolean): Promise<void> {
  const paths = runtimePaths(context);
  try {
    await fs.access(paths.trustedSetupBinary);
  } catch {
    throw new Error(
      `The selected release ${context.releaseTag} does not contain the trusted-setup binary for ${context.platform}. ` +
      'Install a newer runtime release or use --no-setup until a release with trusted-setup support is available.',
    );
  }
  await emptyDir(paths.setupOutputDir);
  const args = [
    '--output',
    paths.setupOutputDir,
    '--fixed-tau',
  ];
  await runCommand(paths.trustedSetupBinary, args, {
    env: backendEnvironment(context),
    verbose,
  });
}

export async function installRuntime(options: InstallOptions): Promise<RuntimeContext> {
  const platform = detectPlatform();
  const releaseTag = await resolveReleaseTag(options.verbose, {
    platform,
    requireSetupAsset: !options.noSetup && !options.trustedSetup,
  });
  const context = createRuntimeContext(releaseTag);
  const platformAsset = assetNameForPlatform(releaseTag, context.platform);
  const platformArchivePath = path.join(context.platformDir, platformAsset);

  await ensureDir(context.platformDir);
  await emptyDir(context.runtimeDir);
  await downloadFile(releaseDownloadUrl(releaseTag, platformAsset), platformArchivePath, options.verbose);

  if (platformAsset.endsWith('.zip')) {
    await extractZip(platformArchivePath, context.runtimeDir, options.verbose);
  } else {
    await extractTarGz(platformArchivePath, context.runtimeDir, options.verbose);
  }

  const paths = runtimePaths(context);
  if (options.noSetup) {
    await emptyDir(paths.setupOutputDir);
  } else if (options.trustedSetup) {
    await runTrustedSetup(context, options.verbose);
  } else {
    await installSetupArchive(context, options.verbose);
  }

  const state: RuntimeState = {
    releaseTag,
    platform: context.platform,
    installedAt: new Date().toISOString(),
  };
  await fs.writeFile(context.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return context;
}
