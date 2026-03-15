#!/usr/bin/env node
/* eslint-disable no-console */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(process.cwd());
const repoRoot = path.resolve(packageRoot, '..', '..', '..', '..', '..');
const privateStateAppDir = path.resolve(repoRoot, 'apps', 'private-state');
const outputDir = path.resolve(packageRoot, 'tests', 'configs', 'private-state-transfer');
const participantCount = 4;
const senderIndexes = [0, 1, 2, 3];

const runCommand = (command: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code ?? 'unknown'}`));
      }
    });
  });

const buildOutputPath = (senderIndex: number) =>
  path.join(outputDir, `config-anvil-private-state-transfer-p${participantCount}-s${senderIndex}.json`);

const main = async () => {
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  await runCommand('make', ['-C', privateStateAppDir, 'anvil-stop']);
  await runCommand('make', ['-C', privateStateAppDir, 'anvil-start']);
  await runCommand('make', ['-C', privateStateAppDir, 'anvil-bootstrap']);

  for (const senderIndex of senderIndexes) {
    const outputPath = buildOutputPath(senderIndex);
    console.log(`[private-state-transfer-config] sender=${senderIndex} output=${outputPath}`);
    await runCommand('tsx', [
      '--tsconfig',
      path.resolve(packageRoot, 'tsconfig.dev.json'),
      path.resolve(packageRoot, 'scripts', 'generate-private-state-transfer-config.ts'),
      '--output',
      outputPath,
      '--participants',
      String(participantCount),
      '--sender',
      String(senderIndex),
    ]);
  }
};

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
