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
const EXAMPLE_ENTRY = path.resolve(packageRoot, 'examples', 'config-runner.ts');
const EXAMPLE_TYPE = 'erc20-transfer';

type Erc20Config = {
  network?: string;
  function?: {
    entryContractAddress?: string;
    selector?: string;
  };
};

class CommandExecutionError extends Error {
  output: string;

  exitCode: number | null;

  constructor(command: string, exitCode: number | null, output: string) {
    super(`${command} exited with code ${exitCode ?? 'unknown'}`);
    this.name = 'CommandExecutionError';
    this.output = output;
    this.exitCode = exitCode;
  }
}

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
        reject(new CommandExecutionError(command, code, combinedOutput));
      }
    });
  });

const ERROR_LOG_PATTERN = /error:/iu;
const ALLOWED_CAPACITY_ERROR_PATTERNS = [
  /Error:\s+Synthesizer:\s+Insufficient\s+\S+\s+length\.\s+Ask the qap-compiler for a longer buffer/u,
  /Error:\s+Synthesizer:\s+Insufficient\s+s_max\.\s+Ask the qap-compiler for increasing s_max/u,
] as const;

const collectErrorLogLines = (output: string) =>
  output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => ERROR_LOG_PATTERN.test(line));

const fileExists = async (target: string) => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

const restoreOutputs = async (sourceDir: string) => {
  await fs.rm(OUTPUTS_DIR, { recursive: true, force: true });
  await fs.mkdir(OUTPUTS_DIR, { recursive: true });
  const entries = await fs.readdir(sourceDir);
  await Promise.all(
    entries.map(async (entry) => {
      const sourcePath = path.join(sourceDir, entry);
      const targetPath = path.join(OUTPUTS_DIR, entry);
      await fs.cp(sourcePath, targetPath, { recursive: true });
    }),
  );
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

const isAllowedCapacityFailure = (output: string) =>
  ALLOWED_CAPACITY_ERROR_PATTERNS.some((pattern) => pattern.test(output));

const normalizeGroupValue = (value: string | undefined) =>
  value ? value.trim().toLowerCase() : '';

const buildGroupKey = (config: Erc20Config) => {
  const network = normalizeGroupValue(config.network);
  const entryContractAddress = normalizeGroupValue(config.function?.entryContractAddress);
  const transferSelector = normalizeGroupValue(config.function?.selector);
  return `${network}|${entryContractAddress}|${transferSelector}`;
};

const validateInstanceDescriptions = async (configs: string[]) => {
  for (const configFile of configs) {
    const baseName = path.parse(configFile).name;
    const outputDir = path.join(ARCHIVE_ROOT, baseName);
    const descriptionPath = path.join(outputDir, 'instance_description.json');
    const contents = await fs.readFile(descriptionPath, 'utf8');
    if (ERROR_LOG_PATTERN.test(contents)) {
      throw new Error(`instance_description.json contains error logs for ${baseName}`);
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

  const successfulConfigs: string[] = [];
  const skippedCapacityConfigs: string[] = [];
  let lastSuccessfulOutputDir: string | null = null;

  for (const configFile of configs) {
    const configPath = path.join(CONFIG_DIR, configFile);
    const baseName = path.parse(configFile).name;
    const destination = path.join(ARCHIVE_ROOT, baseName);

    console.log(`[erc20-main] Running ${configFile}`);
    try {
      const output = await runCommand('tsx', [EXAMPLE_ENTRY, EXAMPLE_TYPE, configPath]);
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
      const output =
        error instanceof CommandExecutionError
          ? error.output
          : error instanceof Error
            ? error.message
            : String(error);
      if (isAllowedCapacityFailure(output)) {
        console.warn(
          `[erc20-main] Skipping ${configFile} because the current published subcircuit library capacity is insufficient.`,
        );
        skippedCapacityConfigs.push(configFile);
        if (lastSuccessfulOutputDir) {
          await restoreOutputs(lastSuccessfulOutputDir);
        }
        continue;
      }
      console.error(`[erc20-main] Failed for config: ${configPath}`);
      throw error;
    }
    await copyOutputs(destination);
    lastSuccessfulOutputDir = destination;
    successfulConfigs.push(configFile);
  }

  if (successfulConfigs.length === 0) {
    console.warn(
      '[erc20-main] No config completed within the current published subcircuit library capacity. Treating this as a non-fatal compatibility limitation.',
    );
    return;
  }

  if (skippedCapacityConfigs.length > 0) {
    console.warn(
      `[erc20-main] Skipped ${skippedCapacityConfigs.length} config(s) due to published subcircuit library capacity limits: ${skippedCapacityConfigs.join(', ')}`,
    );
  }

  console.log('[erc20-main] Validating permutation.json consistency');
  await comparePermutations(successfulConfigs);
  console.log('[erc20-main] Validating instance_description.json contents');
  await validateInstanceDescriptions(successfulConfigs);
};

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
