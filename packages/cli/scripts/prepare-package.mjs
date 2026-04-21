import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const packageRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const vendorWorkspaceRoot = path.join(packageRoot, 'vendor', 'workspace');
const assetRoot = path.join(packageRoot, 'scripts', 'runtime-assets');

const backendExclusions = new Set([
  'target',
  '.vscode',
  'external-lib',
]);

const directoryExclusions = new Set([
  'output',
  'output-mpc',
  'output-mpc-general',
]);

const fileExclusions = [
  '.env',
  /^gen-lang-client-.*\.json$/u,
];

async function ensureDir(target) {
  await fs.mkdir(target, { recursive: true });
}

async function copyFile(from, to) {
  await ensureDir(path.dirname(to));
  await fs.copyFile(from, to);
}

function shouldCopyBackendPath(sourcePath) {
  const relative = path.relative(path.join(repoRoot, 'packages', 'backend'), sourcePath);
  if (!relative || relative.startsWith('..')) {
    return true;
  }

  const parts = relative.split(path.sep);
  for (const part of parts) {
    if (backendExclusions.has(part) || directoryExclusions.has(part)) {
      return false;
    }
  }
  const leaf = parts.at(-1) ?? '';
  for (const matcher of fileExclusions) {
    if (typeof matcher === 'string' ? leaf === matcher : matcher.test(leaf)) {
      return false;
    }
  }
  return true;
}

async function copyDirectory(from, to, filter) {
  await fs.cp(from, to, {
    recursive: true,
    filter: filter ?? (() => true),
  });
}

async function chmodRecursive(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        await chmodRecursive(entryPath);
        return;
      }
      if (entry.name.endsWith('.sh') || entry.name === 'tokamak-cli') {
        await fs.chmod(entryPath, 0o755);
      }
    }),
  );
}

async function removeExcludedBackendFiles(root) {
  await fs.rm(path.join(root, '.env'), { force: true });
  const entries = await fs.readdir(root, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /^gen-lang-client-.*\.json$/u.test(entry.name))
      .map((entry) => fs.rm(path.join(root, entry.name), { force: true })),
  );
}

async function main() {
  await fs.rm(path.join(packageRoot, 'vendor'), { recursive: true, force: true });
  await ensureDir(vendorWorkspaceRoot);

  await copyFile(
    path.join(assetRoot, 'packaging.sh'),
    path.join(vendorWorkspaceRoot, 'scripts', 'packaging.sh'),
  );
  await copyDirectory(
    path.join(assetRoot, 'run_scripts'),
    path.join(vendorWorkspaceRoot, '.run_scripts'),
  );
  await copyDirectory(
    path.join(repoRoot, 'packages', 'backend'),
    path.join(vendorWorkspaceRoot, 'packages', 'backend'),
    shouldCopyBackendPath,
  );

  const vendoredBackendRoot = path.join(vendorWorkspaceRoot, 'packages', 'backend');
  if (fsSync.existsSync(vendoredBackendRoot)) {
    await removeExcludedBackendFiles(vendoredBackendRoot);
  }

  await chmodRecursive(vendorWorkspaceRoot);
}

await main();
