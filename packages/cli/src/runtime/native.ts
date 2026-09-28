import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ensureDir, runtimePaths } from './context.js';
import {
  BACKEND_PACKAGE_NAMES,
  type BackendPackageName,
} from '../generated/backend-build-metadata-validator.generated.js';
import type { InstallOptions, RuntimeContext } from './model.js';
import { readProductionBackendRuntimeIdentity, validateBackendRuntimeIdentityForContext } from './identity.js';
import { runCommand } from '../system.js';

interface CargoMetadata {
  target_directory?: string;
}

function resolveVendoredBackendRoot(packageRoot: string): string {
  return path.join(packageRoot, 'vendor', 'backend');
}

export async function ensureVendoredBackendExists(packageRoot: string): Promise<string> {
  const backendRoot = resolveVendoredBackendRoot(packageRoot);
  const cargoManifestPath = path.join(backendRoot, 'Cargo.toml');
  try {
    await fs.access(cargoManifestPath);
  } catch {
    throw new Error(
      'The vendored backend workspace is missing. Rebuild the package so that vendor/backend is populated.',
    );
  }
  return backendRoot;
}

export interface BuiltBackendRelease {
  readonly backendReleaseDir: string;
  readonly runtimeIdentity: import('./model.js').BackendRuntimeIdentity;
}

export async function buildBackendReleaseBinaries(
  backendRoot: string,
  options: InstallOptions,
  context: RuntimeContext,
  setupDirectory: string,
): Promise<BuiltBackendRelease> {
  for (const packageName of BACKEND_PACKAGE_NAMES) {
    await runCommand('cargo', backendProductionBuildArgs(packageName), {
      cwd: backendRoot,
      env: { ...process.env, TOKAMAK_VERIFIER_KEYS: path.join(setupDirectory, 'verifier_keys.rkyv') },
      verbose: options.verbose,
    });
  }
  const backendReleaseDir = resolveCargoReleaseDir(backendRoot);
  const runtimeIdentity = validateBackendRuntimeIdentityForContext(
    await readProductionBackendRuntimeIdentity(backendReleaseDir),
    context,
    'Production backend runtime identity',
  );
  return { backendReleaseDir, runtimeIdentity };
}

export function backendProductionBuildArgs(packageName: BackendPackageName): string[] {
  return [
    'build',
    '--locked',
    '-p',
    packageName,
    '--release',
    '--no-default-features',
    '--features',
    'production-npm-subcircuit-library',
  ];
}

export async function validateProductionBuildMetadata(
  backendReleaseDir: string,
): Promise<import('./model.js').BackendRuntimeIdentity> {
  return await readProductionBackendRuntimeIdentity(backendReleaseDir);
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

export async function copyBuiltBackendBinaries(context: RuntimeContext, backendReleaseDir: string): Promise<void> {
  const paths = runtimePaths(context);

  await ensureDir(paths.binaryDir);
  for (const binaryName of BACKEND_PACKAGE_NAMES) {
    const sourcePath = path.join(backendReleaseDir, binaryName);
    await fs.access(sourcePath);
    await fs.copyFile(sourcePath, path.join(paths.binaryDir, binaryName));
  }
}

function applyInstallNameTool(binaryPath: string, rpath: string, verbose: boolean): void {
  const result = spawnSync('install_name_tool', ['-add_rpath', rpath, binaryPath], {
    stdio: verbose ? 'inherit' : 'ignore',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `install_name_tool exited with code ${result.status ?? 'unknown'} while configuring ${binaryPath}.`,
    );
  }
}

export async function configureMacosRuntime(context: RuntimeContext, verbose: boolean): Promise<void> {
  if (context.platform !== 'macos') {
    return;
  }
  const paths = runtimePaths(context);
  const rpath = '@executable_path/../backend-lib/icicle/lib';
  for (const binaryName of BACKEND_PACKAGE_NAMES) {
    const binaryPath = path.join(paths.binaryDir, binaryName);
    if (fsSync.existsSync(binaryPath)) {
      applyInstallNameTool(binaryPath, rpath, verbose);
    }
  }
}
