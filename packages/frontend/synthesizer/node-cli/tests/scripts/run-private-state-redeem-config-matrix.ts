#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { createPrivateStateAnvilFixture, runInheritedCommand } from './private-state-anvil-fixture.ts';

const packageRoot = path.resolve(process.cwd());
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
  const args: { inputs: number; outputDir?: string } = { inputs: defaultInputCount };
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
        if (inputCount !== 1 && inputCount !== 2 && inputCount !== 3 && inputCount !== 4) {
          throw new Error('inputs must be 1, 2, 3, or 4');
        }
        args.inputs = inputCount;
        break;
      }
      case '--output-dir':
        args.outputDir = consumeValue(current);
        break;
      default:
        throw new Error(`Unknown argument: ${current}`);
    }
  }

  if (args.outputDir === undefined) {
    throw new Error('--output-dir is required for a private-state topology matrix');
  }
  return { inputs: args.inputs, outputDir: path.resolve(args.outputDir) };
};

const buildOutputPath = (outputDir: string, inputCount: number, senderIndex: number) =>
  path.join(outputDir, `config-anvil-private-state-redeem-n${inputCount}-p${participantCount}-s${senderIndex}.json`);

const main = async () => {
  const { inputs, outputDir } = parseArgs();
  const fixture = await createPrivateStateAnvilFixture(packageRoot, `redeem-n${inputs}`);
  await fs.mkdir(outputDir, { recursive: true });

  for (const senderIndex of senderIndexes) {
    const outputPath = buildOutputPath(outputDir, inputs, senderIndex);
    console.log(`[private-state-redeem-config] inputs=${inputs} sender=${senderIndex} output=${outputPath}`);
    await runInheritedCommand('tsx', [
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
      '--deployment-manifest',
      fixture.deploymentManifestPath,
      '--storage-layout',
      fixture.storageLayoutPath,
    ], packageRoot);
  }
};

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
