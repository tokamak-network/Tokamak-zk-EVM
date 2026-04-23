#!/usr/bin/env node
/* eslint-disable no-console */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

type PrivateStateMintConfig = {
  network?: string;
  function?: {
    entryContractAddress?: string;
    selector?: string;
  };
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(process.cwd());
const repoRoot = path.resolve(packageRoot, '..', '..', '..', '..', '..');
const privateStateAppDir = path.resolve(repoRoot, 'apps', 'private-state');

const configDir = path.resolve(packageRoot, 'tests', 'configs', 'private-state-mint');
const outputsDir = path.resolve(packageRoot, 'outputs');
const archiveRoot = path.resolve(packageRoot, 'tests', 'outputs', 'private-state-mint');
const exampleEntry = path.resolve(packageRoot, '..', 'examples', 'config-runner.ts');
const exampleType = 'private-state-mint';
const prepEntry = path.resolve(packageRoot, 'tests', 'scripts', 'run-private-state-mint-config-matrix.ts');
const errorLogPattern = /error:/iu;

const runCommand = (command: string, args: string[]) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let combinedOutput = '';
    child.stdout.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      combinedOutput += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      combinedOutput += text;
      process.stderr.write(text);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(combinedOutput);
      } else {
        reject(new Error(`${command} exited with code ${code ?? 'unknown'}`));
      }
    });
  });

const fileExists = async (target: string) => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

const copyOutputs = async (destination: string) => {
  await fs.mkdir(destination, { recursive: true });
  if (!(await fileExists(outputsDir))) {
    return;
  }
  const entries = await fs.readdir(outputsDir);
  await Promise.all(
    entries.map(async (entry) => {
      const sourcePath = path.join(outputsDir, entry);
      const targetPath = path.join(destination, entry);
      await fs.rm(targetPath, { recursive: true, force: true });
      await fs.cp(sourcePath, targetPath, { recursive: true });
    }),
  );
};

const collectErrorLogLines = (output: string) =>
  output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => errorLogPattern.test(line));

const normalizeGroupValue = (value: string | undefined) =>
  value ? value.trim().toLowerCase() : '';

const buildGroupKey = (config: PrivateStateMintConfig) => {
  const network = normalizeGroupValue(config.network);
  const entryContractAddress = normalizeGroupValue(config.function?.entryContractAddress);
  const selector = normalizeGroupValue(config.function?.selector);
  return `${network}|${entryContractAddress}|${selector}`;
};

const validateInstanceDescriptions = async (configs: string[]) => {
  for (const configFile of configs) {
    const baseName = path.parse(configFile).name;
    const descriptionPath = path.join(archiveRoot, baseName, 'instance_description.json');
    const contents = await fs.readFile(descriptionPath, 'utf8');
    if (errorLogPattern.test(contents)) {
      throw new Error(`instance_description.json contains error logs for ${baseName}`);
    }
  }
};

const comparePermutations = async (configs: string[]) => {
  const groupMap = new Map<string, { baseName: string; contents: Buffer }>();

  for (const configFile of configs) {
    const configPath = path.join(configDir, configFile);
    const baseName = path.parse(configFile).name;
    const permutationPath = path.join(archiveRoot, baseName, 'permutation.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf8')) as PrivateStateMintConfig;
    const groupKey = buildGroupKey(config);
    const permutationContents = await fs.readFile(permutationPath);
    const existing = groupMap.get(groupKey);
    if (!existing) {
      groupMap.set(groupKey, { baseName, contents: permutationContents });
      continue;
    }
    if (!existing.contents.equals(permutationContents)) {
      throw new Error(
        [
          'Permutation mismatch for private-state mint group:',
          `  key=${groupKey}`,
          `  baseline=${existing.baseName}`,
          `  mismatch=${baseName}`,
        ].join('\n'),
      );
    }
  }
};

const main = async () => {
  await fs.mkdir(archiveRoot, { recursive: true });

  try {
    console.log('[private-state-main] Preparing fresh anvil configs');
    await runCommand('tsx', [
      '--tsconfig',
      path.resolve(packageRoot, 'tsconfig.dev.json'),
      prepEntry,
    ]);

    const configs = (await fs.readdir(configDir))
      .filter((entry) => entry.endsWith('.json'))
      .sort((a, b) => a.localeCompare(b));

    if (configs.length === 0) {
      throw new Error(`No private-state mint config files found in ${configDir}`);
    }

    for (const configFile of configs) {
      const configPath = path.join(configDir, configFile);
      const baseName = path.parse(configFile).name;
      const destination = path.join(archiveRoot, baseName);

      console.log(`[private-state-main] Running ${configFile}`);
      try {
        const output = await runCommand('tsx', [
          '--tsconfig',
          path.resolve(packageRoot, 'tsconfig.dev.json'),
          exampleEntry,
          exampleType,
          configPath,
        ]);
        const errorLogLines = collectErrorLogLines(output);
        if (errorLogLines.length > 0) {
          throw new Error(
            [
              `Final execution emitted error logs for ${configFile}:`,
              ...errorLogLines.map((line) => `  ${line}`),
            ].join('\n'),
          );
        }
      } catch (error) {
        console.error(`[private-state-main] Failed for config: ${configPath}`);
        throw error;
      }
      await copyOutputs(destination);
    }

    console.log('[private-state-main] Validating permutation.json consistency');
    await comparePermutations(configs);
    console.log('[private-state-main] Validating instance_description.json contents');
    await validateInstanceDescriptions(configs);
  } finally {
    await runCommand('make', ['-C', privateStateAppDir, 'anvil-stop']);
  }
};

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
