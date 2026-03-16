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
const defaultInputCount = 1;
const defaultOutputCount = 2;

const isSupportedTransferArity = (inputCount: number, outputCount: number) =>
  (outputCount === 1 && inputCount >= 1 && inputCount <= 4)
  || (outputCount === 2 && inputCount >= 1 && inputCount <= 3);

type ParsedArgs = {
  inputCount: number;
  outputCount: number;
};

const parseArgs = (): ParsedArgs => {
  const parsed: ParsedArgs = {
    inputCount: defaultInputCount,
    outputCount: defaultOutputCount,
  };
  const argv = process.argv.slice(2);

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    const consumeValue = () => {
      if (!next || next.startsWith('-')) {
        throw new Error(`Missing value for ${current}`);
      }
      index += 1;
      return Number(next);
    };

    switch (current) {
      case '--inputs':
      case '-i':
        parsed.inputCount = consumeValue();
        break;
      case '--outputs':
      case '-m':
        parsed.outputCount = consumeValue();
        break;
      default:
        throw new Error(`Unknown argument: ${current}`);
    }
  }

  return parsed;
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

const buildOutputPath = (inputCount: number, outputCount: number, senderIndex: number) =>
  path.join(
    outputDir,
    `config-anvil-private-state-transfer-n${inputCount}-m${outputCount}-p${participantCount}-s${senderIndex}.json`,
  );

const main = async () => {
  const { inputCount, outputCount } = parseArgs();
  if (!isSupportedTransferArity(inputCount, outputCount)) {
    throw new Error('private-state transfer prep only supports N<=4 for To1 and N<=3 for To2');
  }
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  await runCommand('make', ['-C', privateStateAppDir, 'anvil-stop']);
  await runCommand('make', ['-C', privateStateAppDir, 'anvil-start']);
  await runCommand('make', ['-C', privateStateAppDir, 'anvil-bootstrap']);

  for (const senderIndex of senderIndexes) {
    const outputPath = buildOutputPath(inputCount, outputCount, senderIndex);
    console.log(
      `[private-state-transfer-config] inputs=${inputCount} outputs=${outputCount} sender=${senderIndex} output=${outputPath}`,
    );
    await runCommand('tsx', [
      '--tsconfig',
      path.resolve(packageRoot, 'tsconfig.dev.json'),
      path.resolve(packageRoot, 'scripts', 'generate-private-state-transfer-config.ts'),
      '--output',
      outputPath,
      '--inputs',
      String(inputCount),
      '--outputs',
      String(outputCount),
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
