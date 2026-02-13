#!/usr/bin/env node
/* eslint-disable no-console */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(process.cwd());

const CONFIG_DIR = path.resolve(packageRoot, 'tests', 'configs');
const OUTPUTS_DIR = path.resolve(packageRoot, 'outputs');
const ARCHIVE_ROOT = path.resolve(packageRoot, 'tests', 'outputs');
const EXAMPLE_ENTRY = path.resolve(packageRoot, 'examples', 'erc20Transfers', 'main.ts');

type Erc20Config = {
  network?: string;
  contractAddress?: string;
  transferSelector?: string;
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
  if (!(await fileExists(OUTPUTS_DIR))) {
    return;
  }
  const entries = await fs.readdir(OUTPUTS_DIR);
  await Promise.all(
    entries.map(async (entry) => {
      const sourcePath = path.join(OUTPUTS_DIR, entry);
      const targetPath = path.join(destination, entry);
      await fs.rm(targetPath, { recursive: true, force: true });
      await fs.cp(sourcePath, targetPath, { recursive: true });
    }),
  );
};

const normalizeGroupValue = (value: string | undefined) =>
  value ? value.trim().toLowerCase() : '';

const buildGroupKey = (config: Erc20Config) => {
  const network = normalizeGroupValue(config.network);
  const contractAddress = normalizeGroupValue(config.contractAddress);
  const transferSelector = normalizeGroupValue(config.transferSelector);
  return `${network}|${contractAddress}|${transferSelector}`;
};

const validateInstanceDescriptions = async (configs: string[]) => {
  for (const configFile of configs) {
    const baseName = path.parse(configFile).name;
    const outputDir = path.join(ARCHIVE_ROOT, baseName);
    const descriptionPath = path.join(outputDir, 'instance_description.json');
    const contents = await fs.readFile(descriptionPath, 'utf8');
    if (contents.includes('Error:')) {
      throw new Error(`instance_description.json contains Error: for ${baseName}`);
    }
  }
};

const comparePermutations = async (configs: string[]) => {
  const groupMap = new Map<string, { baseName: string; contents: Buffer }>();

  for (const configFile of configs) {
    const configPath = path.join(CONFIG_DIR, configFile);
    const baseName = path.parse(configFile).name;
    const outputDir = path.join(ARCHIVE_ROOT, baseName);
    const permutationPath = path.join(outputDir, 'permutation.json');

    const rawConfig = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(rawConfig) as Erc20Config;
    const groupKey = buildGroupKey(parsed);

    const permutationContents = await fs.readFile(permutationPath);
    const existing = groupMap.get(groupKey);
    if (!existing) {
      groupMap.set(groupKey, { baseName, contents: permutationContents });
      continue;
    }

    if (!existing.contents.equals(permutationContents)) {
      throw new Error(
        [
          'Permutation mismatch for group:',
          `  key=${groupKey}`,
          `  baseline=${existing.baseName}`,
          `  mismatch=${baseName}`,
        ].join('\n'),
      );
    }
  }
};

const main = async () => {
  await fs.mkdir(ARCHIVE_ROOT, { recursive: true });
  const configs = (await fs.readdir(CONFIG_DIR))
    .filter((entry) => entry.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b));

  if (configs.length === 0) {
    throw new Error(`No config files found in ${CONFIG_DIR}`);
  }

  for (const configFile of configs) {
    const configPath = path.join(CONFIG_DIR, configFile);
    const baseName = path.parse(configFile).name;
    const destination = path.join(ARCHIVE_ROOT, baseName);

    console.log(`[erc20-main] Running ${configFile}`);
    try {
      await runCommand('tsx', [EXAMPLE_ENTRY, configPath]);
    } catch (error) {
      console.error(`[erc20-main] Failed for config: ${configPath}`);
      throw error;
    }
    await copyOutputs(destination);
  }

  console.log('[erc20-main] Validating permutation.json consistency');
  await comparePermutations(configs);
  console.log('[erc20-main] Validating instance_description.json contents');
  await validateInstanceDescriptions(configs);
};

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
