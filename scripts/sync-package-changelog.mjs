#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = process.argv[2];

if (!packageDir) {
  console.error('Usage: node scripts/sync-package-changelog.mjs <package-dir>');
  process.exit(1);
}

const sourcePath = path.join(repoRoot, 'CHANGELOG.md');
const packageRoot = path.resolve(repoRoot, packageDir);
const targetPath = path.join(packageRoot, 'CHANGELOG.md');

await fs.access(sourcePath);
await fs.access(packageRoot);

const changelog = await fs.readFile(sourcePath, 'utf8');
await fs.writeFile(targetPath, changelog, 'utf8');

console.log(`[sync-package-changelog] Copied root CHANGELOG.md to '${path.relative(repoRoot, targetPath)}'.`);
