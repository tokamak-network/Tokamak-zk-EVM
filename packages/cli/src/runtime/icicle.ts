import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ensureDir } from './context.js';
import { downloadFile, fileExists, normalizeSha256, sha256FileHex } from './download.js';
import type { NativeRuntimeOs, RuntimeContext } from './model.js';
import { commandExists, logVerbose, runCommand } from '../system.js';

interface IcicleAsset {
  fileName: string;
  sha256: string;
  url: string;
}

interface IcicleManifest {
  version: string;
  assets: Record<string, IcicleAsset>;
}

const ICICLE_VERSION = '3.8.0';

const ICICLE_MANIFEST_PATH = path.join('manifests', `icicle-v${ICICLE_VERSION}.json`);

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

async function extractTarArchive(archivePath: string, destinationPath: string, verbose: boolean): Promise<void> {
  await ensureDir(destinationPath);
  await runCommand('tar', ['-xzf', archivePath, '-C', destinationPath], {
    verbose,
  });
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
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

export async function installIcicleRuntime(
  context: RuntimeContext,
  nativeOs: NativeRuntimeOs,
  verbose: boolean,
): Promise<void> {
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
      if (nativeOs.platform !== 'linux') {
        throw new Error('Internal error: the detected operating system does not match the Linux runtime.');
      }
      const ubuntuMajor = nativeOs.ubuntuVersion.slice(0, 2);
      const commonTarball = await downloadIcicleAssetWithCache(
        context,
        selectIcicleAsset(manifest, `ubuntu${ubuntuMajor}`),
        verbose,
      );
      await extractTarArchive(commonTarball, tempRoot, verbose);
      const installCudaBackend = await linuxCudaBackendAvailable(verbose);
      if (installCudaBackend) {
        logVerbose(verbose, 'Installing CUDA ICICLE backend package.');
        const backendTarball = await downloadIcicleAssetWithCache(
          context,
          selectIcicleAsset(manifest, `ubuntu${ubuntuMajor}-cuda122`),
          verbose,
        );
        await extractTarArchive(backendTarball, tempRoot, verbose);
      }
    }

    const destinationDir = path.join(context.runtimeDir, 'backend-lib', 'icicle');
    await ensureDir(path.dirname(destinationDir));
    await fs.cp(path.join(tempRoot, 'icicle'), destinationDir, { recursive: true });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}
