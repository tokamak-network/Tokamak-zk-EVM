#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(here, '..');
const packageDir = process.argv[2];

if (!packageDir) {
  console.error('Usage: node scripts/sync-package-changelog.mjs <package-dir>');
  process.exit(1);
}

const packageRoot = path.resolve(workspaceRoot, packageDir);
const sourcePath = path.join(workspaceRoot, 'CHANGELOG.md');
const targetPath = path.join(packageRoot, 'CHANGELOG.md');

await fs.access(sourcePath);
await fs.access(packageRoot);

const changelog = await fs.readFile(sourcePath, 'utf8');
await fs.writeFile(targetPath, changelog);

console.log(`[sync-package-changelog] Copied root changelog to '${targetPath}'.`);
