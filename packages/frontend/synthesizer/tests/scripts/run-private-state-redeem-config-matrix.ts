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
const outputDir = path.resolve(packageRoot, 'tests', 'configs', 'private-state-redeem');
const participantCount = 4;
const senderIndexes = [0, 1, 2, 3];
const defaultInputCount = 1;

const parseInteger = (value: unknown, label: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer`);
  }
  return parsed;
};

const parseArgs = () => {
  const args = { inputs: defaultInputCount };
  const argv = process.argv.slice(2);

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    const consumeValue = (label: string) => {
      if (!next || next.startsWith('-')) {
        throw new Error(`Missing value for ${label}`);
      }
      index += 1;
      return next;
    };

    switch (current) {
      case '--inputs':
      case '-n': {
        const inputCount = parseInteger(consumeValue(current), 'inputs');
        if (inputCount !== 1 && inputCount !== 2 && inputCount !== 3) {
          throw new Error('inputs must be 1, 2, or 3');
        }
        args.inputs = inputCount;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${current}`);
    }
  }

  return args;
};

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

const buildOutputPath = (inputCount: number, senderIndex: number) =>
  path.join(outputDir, `config-anvil-private-state-redeem-n${inputCount}-p${participantCount}-s${senderIndex}.json`);

const main = async () => {
  const { inputs } = parseArgs();
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  await runCommand('make', ['-C', privateStateAppDir, 'anvil-stop']);
  await runCommand('make', ['-C', privateStateAppDir, 'anvil-start']);
  await runCommand('make', ['-C', privateStateAppDir, 'anvil-bootstrap']);

  for (const senderIndex of senderIndexes) {
    const outputPath = buildOutputPath(inputs, senderIndex);
    console.log(`[private-state-redeem-config] inputs=${inputs} sender=${senderIndex} output=${outputPath}`);
    await runCommand('tsx', [
      '--tsconfig',
      path.resolve(packageRoot, 'tsconfig.dev.json'),
      path.resolve(packageRoot, 'scripts', 'generate-private-state-redeem-config.ts'),
      '--output',
      outputPath,
      '--participants',
      String(participantCount),
      '--sender',
      String(senderIndex),
      '--inputs',
      String(inputs),
    ]);
  }
};

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
