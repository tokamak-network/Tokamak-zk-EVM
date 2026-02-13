#!/usr/bin/env node
/* eslint-disable no-console */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

type NetworkName = 'mainnet' | 'sepolia';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(process.cwd());
const resolveFromRoot = (...segments: string[]) =>
  path.resolve(packageRoot, ...segments);

const OUTPUT_DIR = resolveFromRoot('tests', 'configs');
const PARTICIPANT_COUNT = 4;
const MAX_ITERATIONS = 10;

const CONTRACTS_BY_NETWORK: Record<NetworkName, string[]> = {
  sepolia: [
    '0x42d3b260c761cD5da022dB56Fe2F89c4A909b04A',
    '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    '0xa30fe40285B8f5c0457DbC3B7C8A280373c40044',
  ],
  mainnet: [
    '0x2be5e8c109e2197D077D13A82dAead6a9b3433C5',
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  ],
};

const INDEX_PAIRS: Array<[number, number]> = [
  [0, 3],
  [1, 2],
  [2, 1],
  [3, 0],
];

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

const runCommandIgnoringFailure = async (
  command: string,
  args: string[],
  context: string,
) => {
  try {
    await runCommand(command, args);
    return true;
  } catch (error) {
    console.error(`[erc20-config] Failed (ignored): ${context}`);
    console.error(error);
    return false;
  }
};

const buildOutputPath = (
  network: NetworkName,
  entryContractAddress: string,
  senderIndex: number,
  recipientIndex: number,
) => {
  const normalized = entryContractAddress.toLowerCase().replace(/^0x/, '');
  const filename = [
    `config-${network}`,
    `p${PARTICIPANT_COUNT}`,
    `i${MAX_ITERATIONS}`,
    normalized,
    `s${senderIndex}`,
    `r${recipientIndex}`,
  ].join('-');
  return path.join(OUTPUT_DIR, `${filename}.json`);
};

const runMatrix = async () => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  for (const [network, contracts] of Object.entries(CONTRACTS_BY_NETWORK) as [NetworkName, string[]][]) {
    for (const entryContractAddress of contracts) {
      for (const [senderIndex, recipientIndex] of INDEX_PAIRS) {
        const outputPath = buildOutputPath(network, entryContractAddress, senderIndex, recipientIndex);
        const context = `network=${network} entryContract=${entryContractAddress} sender=${senderIndex} recipient=${recipientIndex}`;
        console.log(`[erc20-config] ${context}`);
        await runCommandIgnoringFailure('tsx', [
          resolveFromRoot('scripts', 'generate-erc20-config.ts'),
          '--network',
          network,
          '--contract',
          entryContractAddress,
          '--participants',
          String(PARTICIPANT_COUNT),
          '--max-iterations',
          String(MAX_ITERATIONS),
          '--sender',
          String(senderIndex),
          '--recipient',
          String(recipientIndex),
          '--output',
          outputPath,
          '--non-interactive',
        ], context);
      }
    }
  }
};

void runMatrix().catch((err) => {
  console.error(err);
  process.exit(1);
});
