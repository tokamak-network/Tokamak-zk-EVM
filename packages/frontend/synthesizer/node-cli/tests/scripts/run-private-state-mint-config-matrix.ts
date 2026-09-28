#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { createPrivateStateAnvilFixture, runInheritedCommand } from './private-state-anvil-fixture.ts';

const packageRoot = path.resolve(process.cwd());
const participantCount = 4;
const senderIndexes = [0, 1, 2, 3];
const defaultOutputCount = 1;

const parseInteger = (value: unknown, label: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer`);
  }
  return parsed;
};

const parseArgs = () => {
  const args: { outputs: number; outputDir?: string } = { outputs: defaultOutputCount };
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
      case '--outputs':
      case '-m': {
        const outputCount = parseInteger(consumeValue(current), 'outputs');
        if (outputCount !== 1 && outputCount !== 2 && outputCount !== 3 && outputCount !== 4 && outputCount !== 5 && outputCount !== 6) {
          throw new Error('outputs must be 1, 2, 3, 4, 5, or 6');
        }
        args.outputs = outputCount;
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
  return { outputs: args.outputs, outputDir: path.resolve(args.outputDir) };
};

const buildOutputPath = (outputDir: string, outputCount: number, senderIndex: number) =>
  path.join(outputDir, `config-anvil-private-state-mint-m${outputCount}-p${participantCount}-s${senderIndex}.json`);

const main = async () => {
  const { outputs, outputDir } = parseArgs();
  const fixture = await createPrivateStateAnvilFixture(packageRoot, `mint-m${outputs}`);
  await fs.mkdir(outputDir, { recursive: true });

  for (const senderIndex of senderIndexes) {
    const outputPath = buildOutputPath(outputDir, outputs, senderIndex);
    console.log(`[private-state-mint-config] outputs=${outputs} sender=${senderIndex} output=${outputPath}`);
    await runInheritedCommand('tsx', [
      '--tsconfig',
      path.resolve(packageRoot, 'tsconfig.dev.json'),
      path.resolve(packageRoot, 'scripts', 'generate-private-state-mint-config.ts'),
      '--output',
      outputPath,
      '--participants',
      String(participantCount),
      '--sender',
      String(senderIndex),
      '--note-owner',
      String(senderIndex),
      '--outputs',
      String(outputs),
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
