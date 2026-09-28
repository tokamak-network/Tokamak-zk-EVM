import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(import.meta.dirname, '..');
const repositoryRoot = path.resolve(packageRoot, '..', '..');
const vendorRoot = path.join(packageRoot, 'vendor');
const vendoredBackendRoot = path.join(vendorRoot, 'backend');
const productManifestPath = path.join(vendoredBackendRoot, 'cli-vendor-product.json');
const producer = path.join(repositoryRoot, 'packages', 'backend', 'common', 'scripts', 'prepare-cli-vendor.mjs');

async function listRegularFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) return await listRegularFiles(entryPath);
    if (!entry.isFile()) throw new Error(`Backend vendor product contains unsupported filesystem entry: ${entryPath}`);
    return [entryPath];
  }));
  return nested.flat();
}

async function validateBackendProduct() {
  const manifest = JSON.parse(await fs.readFile(productManifestPath, 'utf8'));
  if (manifest?.contractVersion !== 1 || !Array.isArray(manifest.files) || !manifest.files.every((file) => typeof file === 'string')) {
    throw new Error('Backend vendor product manifest is invalid.');
  }
  const expected = new Set([...manifest.files, 'cli-vendor-product.json']);
  const actual = new Set(
    (await listRegularFiles(vendoredBackendRoot))
      .map((filePath) => path.relative(vendoredBackendRoot, filePath).split(path.sep).join('/')),
  );
  if (expected.size !== actual.size || [...expected].some((file) => !actual.has(file))) {
    throw new Error('Backend vendor product file closure does not match its manifest.');
  }
}

async function main() {
  await fs.rm(vendorRoot, { recursive: true, force: true });
  await execFileAsync(process.execPath, [producer, '--output', vendoredBackendRoot]);
  await validateBackendProduct();
}

await main();
