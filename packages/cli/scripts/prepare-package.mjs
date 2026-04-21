import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const packageRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const vendoredBackendRoot = path.join(packageRoot, 'vendor', 'backend');

const backendExclusions = new Set([
  'target',
  '.vscode',
  'external-lib',
]);

const directoryExclusions = new Set([
  'output',
  'output-mpc',
  'output-mpc-general',
  'benches',
  'docs',
  'optimization',
  'verify-wasm',
]);

const fileExclusions = [
  '.env',
  '.DS_Store',
  'README.md',
  'README_mpc.md',
  'download-ICICLE-lib.sh',
  'Dockerfile',
  /^Dockerfile\..*/u,
  /^gen-lang-client-.*\.json$/u,
];

async function ensureDir(target) {
  await fs.mkdir(target, { recursive: true });
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

async function removeExcludedBackendFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        if (directoryExclusions.has(entry.name)) {
          await fs.rm(entryPath, { recursive: true, force: true });
          return;
        }
        await removeExcludedBackendFiles(entryPath);
        return;
      }
      const shouldRemove = fileExclusions.some((matcher) =>
        typeof matcher === 'string' ? entry.name === matcher : matcher.test(entry.name),
      );
      if (shouldRemove) {
        await fs.rm(entryPath, { force: true });
      }
    }),
  );
}

async function main() {
  await fs.rm(path.join(packageRoot, 'vendor'), { recursive: true, force: true });
  await ensureDir(vendoredBackendRoot);
  await copyDirectory(
    path.join(repoRoot, 'packages', 'backend'),
    vendoredBackendRoot,
    shouldCopyBackendPath,
  );

  if (fsSync.existsSync(vendoredBackendRoot)) {
    await removeExcludedBackendFiles(vendoredBackendRoot);
  }
}

await main();
