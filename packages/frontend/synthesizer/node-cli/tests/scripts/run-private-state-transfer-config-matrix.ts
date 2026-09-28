#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { createPrivateStateAnvilFixture, runInheritedCommand } from './private-state-anvil-fixture.ts';

const packageRoot = path.resolve(process.cwd());
const participantCount = 4;
const senderIndexes = [0, 1, 2, 3];
const defaultInputCount = 1;
const defaultOutputCount = 2;

const isSupportedTransferArity = (inputCount: number, outputCount: number) =>
  (outputCount === 1 && inputCount >= 1 && inputCount <= 4)
  || (outputCount === 2 && inputCount >= 1 && inputCount <= 3)
  || (outputCount === 3 && inputCount === 1);

type ParsedArgs = {
  inputCount: number;
  outputCount: number;
  outputDir?: string;
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
      return next;
    };

    switch (current) {
      case '--inputs':
      case '-i':
        parsed.inputCount = Number(consumeValue());
        break;
      case '--outputs':
      case '-m':
        parsed.outputCount = Number(consumeValue());
        break;
      case '--output-dir':
        parsed.outputDir = consumeValue();
        break;
      default:
        throw new Error(`Unknown argument: ${current}`);
    }
  }

  return parsed;
};

const buildOutputPath = (outputDir: string, inputCount: number, outputCount: number, senderIndex: number) =>
  path.join(
    outputDir,
    `config-anvil-private-state-transfer-n${inputCount}-m${outputCount}-p${participantCount}-s${senderIndex}.json`,
  );

const main = async () => {
  const { inputCount, outputCount, outputDir: requestedOutputDir } = parseArgs();
  if (!isSupportedTransferArity(inputCount, outputCount)) {
    throw new Error('private-state transfer prep only supports N<=4 for To1, N<=3 for To2, and only 1->3 for To3');
  }
  if (requestedOutputDir === undefined) {
    throw new Error('--output-dir is required for a private-state topology matrix');
  }
  const outputDir = path.resolve(requestedOutputDir);
  const fixture = await createPrivateStateAnvilFixture(packageRoot, `transfer-n${inputCount}-m${outputCount}`);
  await fs.mkdir(outputDir, { recursive: true });

  for (const senderIndex of senderIndexes) {
    const outputPath = buildOutputPath(outputDir, inputCount, outputCount, senderIndex);
    console.log(
      `[private-state-transfer-config] inputs=${inputCount} outputs=${outputCount} sender=${senderIndex} output=${outputPath}`,
    );
    await runInheritedCommand('tsx', [
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
