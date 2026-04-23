import fs from 'node:fs/promises';
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

const cargoManifestSanitizers = [
  /\n\[\[bench\]\]\r?\nname = "outer_product_bench"\r?\nharness = false\r?\n?/gu,
  /\n\[\[bench\]\]\r?\nname = "matrix_matrix_mul_bench"\r?\nharness = false\r?\n?/gu,
  /\n\[\[test\]\]\r?\nname = "timing"\r?\npath = "optimization\/tests\/timing\.rs"\r?\n?/gu,
  /\ncriterion = "0\.3"\r?\n/gu,
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

async function sanitizeCargoManifest(filePath) {
  let contents = await fs.readFile(filePath, 'utf8');
  for (const sanitizer of cargoManifestSanitizers) {
    contents = contents.replace(sanitizer, '\n');
  }
  await fs.writeFile(filePath, contents, 'utf8');
}

async function main() {
  await fs.rm(path.join(packageRoot, 'vendor'), { recursive: true, force: true });
  await ensureDir(vendoredBackendRoot);
  await copyDirectory(
    path.join(repoRoot, 'packages', 'backend'),
    vendoredBackendRoot,
    shouldCopyBackendPath,
  );

  await sanitizeCargoManifest(path.join(vendoredBackendRoot, 'libs', 'Cargo.toml'));
  await sanitizeCargoManifest(path.join(vendoredBackendRoot, 'prove', 'Cargo.toml'));
}

await main();
