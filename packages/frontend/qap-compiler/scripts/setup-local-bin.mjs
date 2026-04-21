#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const binDir = path.resolve(packageRoot, 'node_modules/.bin');
const binPath = path.join(binDir, 'qap-compiler');
const targetPath = path.resolve(packageRoot, 'scripts/qap-compiler.mjs');
const relativeTarget = path.relative(binDir, targetPath);

fs.mkdirSync(binDir, { recursive: true });

if (fs.existsSync(binPath)) {
  try {
    const currentTarget = fs.readlinkSync(binPath);
    if (currentTarget === relativeTarget) {
      process.exit(0);
    }
  } catch (error) {
    if (fs.existsSync(binPath)) {
      fs.rmSync(binPath, { force: true });
    }
  }
}

fs.symlinkSync(relativeTarget, binPath);
