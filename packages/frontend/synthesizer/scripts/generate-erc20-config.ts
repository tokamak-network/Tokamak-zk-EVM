#!/usr/bin/env node
/* eslint-disable no-console */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import inquirer from 'inquirer';
import minimist from 'minimist';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { BufferErrorMessage } from '../src/synthesizer/types/buffers.ts';

type ParticipantEntry = {
  addressL1: `0x${string}`;
  prvSeedL2: string;
};

type Erc20TransferConfig = {
  participants: ParticipantEntry[];
  senderIndex: number;
  recipientIndex: number;
  userStorageSlots: number[];
  preAllocatedKeys: `0x${string}`[];
  txNonce: number;
  blockNumber: number;
  network: NetworkName | '';
  txHash: `0x${string}` | '';
  contractAddress: `0x${string}` | '';
  amount: `0x${string}` | '';
  transferSelector: `0x${string}` | '';
  callCodeAddresses: `0x${string}`[];
};

type NetworkName = 'mainnet' | 'sepolia';

type BaseInputs = {
  network: NetworkName;
  contractAddress: `0x${string}`;
  participantCount: number;
  maxIterations: number;
  senderIndex: number;
  recipientIndex: number;
};

type CliConfig = {
  outputPath: string;
  finalPath: string;
  baseInputs?: BaseInputs;
};

type EtherscanTx = {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  from: string;
  to: string;
  value: string;
  input: string;
  isError?: string;
  txreceipt_status?: string;
};

type EtherscanResponse = {
  status: string;
  message: string;
  result: EtherscanTx[] | string;
};

const ETHERSCAN_API_BASE = 'https://api.etherscan.io/v2/api';
const CHAIN_ID_BY_NETWORK: Record<NetworkName, string> = {
  mainnet: '1',
  sepolia: '11155111',
};

const DEFAULT_CONFIG: Erc20TransferConfig = {
  participants: [
    { addressL1: '0x0000000000000000000000000000000000000000', prvSeedL2: "Sender's L2 wallet" },
    { addressL1: '0x0000000000000000000000000000000000000000', prvSeedL2: "Recipient's L2 wallet" },
  ],
  senderIndex: 0,
  recipientIndex: 1,
  userStorageSlots: [],
  preAllocatedKeys: [],
  txNonce: 0,
  blockNumber: 0,
  network: '',
  txHash: '',
  contractAddress: '',
  amount: '',
  transferSelector: '0xa9059cbb',
  callCodeAddresses: [],
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const resolveFromRoot = (...segments: string[]) =>
  path.resolve(packageRoot, ...segments);
const scriptsEnvPath = path.resolve(__dirname, '.env');
const rootEnvPath = path.resolve(packageRoot, '.env');

const ANALYSIS_DIR = resolveFromRoot('outputs', 'analysis');
const STEP_LOG_PATH = path.join(ANALYSIS_DIR, 'step_log.json');
const MESSAGE_CODE_ADDRESSES_PATH = path.join(ANALYSIS_DIR, 'message_code_addresses.json');
const FINAL_CONFIG_PATH = resolveFromRoot('scripts', 'config.json');
const INSTANCE_DESCRIPTION_PATH = resolveFromRoot('outputs', 'instance_description.json');
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEFAULT_MAX_ANALYSIS_ITERATIONS = 10;

dotenv.config({ path: scriptsEnvPath });
if (!process.env.ETHERSCAN_API_KEY) {
  dotenv.config({ path: rootEnvPath });
}

const writeConfig = async (targetPath: string, config: Erc20TransferConfig) => {
  const json = JSON.stringify(config, null, 2);
  await fs.writeFile(targetPath, `${json}\n`, 'utf8');
};

const finalizeConfig = async (
  config: Erc20TransferConfig,
  workingPath: string,
  finalPath: string,
) => {
  await writeConfig(finalPath, config);
  if (finalPath !== FINAL_CONFIG_PATH) {
    await writeConfig(FINAL_CONFIG_PATH, config);
    console.log(`Updated canonical config at ${FINAL_CONFIG_PATH}`);
  }
  if (workingPath !== finalPath) {
    await fs.rm(workingPath, { force: true });
  }
  console.log(`Saved final config to ${finalPath}`);
};

const runExample = async (configPath: string) => {
  await runCommand('tsx', [resolveFromRoot('examples/erc20Transfers/main.ts'), configPath]);
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

const toHexString = (value: string): `0x${string}` => {
  const trimmed = value.trim();
  if (trimmed.startsWith('0x')) {
    return trimmed as `0x${string}`;
  }
  return `0x${trimmed}` as `0x${string}`;
};

const normalizeNetwork = (value: string): NetworkName | null => {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'mainnet' || normalized === 'sepolia') {
    return normalized;
  }
  return null;
};

const parseInteger = (value: unknown, label: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer`);
  }
  return parsed;
};

const parseCliInputs = (): CliConfig => {
  const args = minimist(process.argv.slice(2), {
    string: [
      'output',
      'network',
      'contract',
      'participants',
      'max-iterations',
      'maxIterations',
      'sender',
      'recipient',
    ],
    boolean: ['non-interactive', 'interactive', 'ci'],
    alias: {
      o: 'output',
      n: 'network',
      c: 'contract',
      p: 'participants',
      m: 'max-iterations',
      s: 'sender',
      r: 'recipient',
    },
  });

  const outputArg = args.output ?? args._[0];
  const outputPath = outputArg
    ? path.resolve(process.cwd(), String(outputArg))
    : resolveFromRoot('scripts', 'temp.json');
  const finalPath = outputArg ? outputPath : FINAL_CONFIG_PATH;

  if (args.interactive) {
    return { outputPath, finalPath };
  }

  const networkRaw = args.network;
  const contractRaw = args.contract;
  const participantRaw = args.participants;
  const maxRaw = args['max-iterations'] ?? args.maxIterations;
  const senderRaw = args.sender;
  const recipientRaw = args.recipient;
  const hasAnyBaseArg = [
    networkRaw,
    contractRaw,
    participantRaw,
    maxRaw,
    senderRaw,
    recipientRaw,
  ].some((value) => value !== undefined);

  if (!hasAnyBaseArg) {
    return { outputPath, finalPath };
  }

  const missing: string[] = [];
  if (!networkRaw) {
    missing.push('network');
  }
  if (!contractRaw) {
    missing.push('contract');
  }
  if (participantRaw === undefined) {
    missing.push('participants');
  }
  if (maxRaw === undefined) {
    missing.push('max-iterations');
  }
  if (senderRaw === undefined) {
    missing.push('sender');
  }
  if (recipientRaw === undefined) {
    missing.push('recipient');
  }

  if (missing.length > 0) {
    if (args['non-interactive'] || args.ci) {
      throw new Error(`Missing required CLI options: ${missing.join(', ')}`);
    }
    return { outputPath, finalPath };
  }

  const network = normalizeNetwork(String(networkRaw));
  if (!network) {
    throw new Error('Network must be "mainnet" or "sepolia"');
  }

  const contractAddress = toHexString(String(contractRaw));
  if (contractAddress.length !== 42) {
    throw new Error('Contract address must be a 42-char hex string (0x...)');
  }

  const participantCount = parseInteger(participantRaw, 'participantCount');
  if (participantCount < 2) {
    throw new Error('participantCount must be >= 2');
  }

  const maxIterations = parseInteger(maxRaw, 'maxIterations');
  if (maxIterations < 1) {
    throw new Error('maxIterations must be >= 1');
  }

  const senderIndex = parseInteger(senderRaw, 'senderIndex');
  const recipientIndex = parseInteger(recipientRaw, 'recipientIndex');
  if (senderIndex < 0 || recipientIndex < 0) {
    throw new Error('sender/recipient index must be non-negative');
  }
  if (senderIndex >= participantCount) {
    throw new Error(`senderIndex must be < participant count (${participantCount})`);
  }
  if (recipientIndex >= participantCount) {
    throw new Error(`recipientIndex must be < participant count (${participantCount})`);
  }
  if (senderIndex === recipientIndex) {
    throw new Error('recipientIndex must be different from senderIndex');
  }

  return {
    outputPath,
    finalPath,
    baseInputs: {
      network,
      contractAddress,
      participantCount,
      maxIterations,
      senderIndex,
      recipientIndex,
    },
  };
};

const fetchFromEtherscan = async (
  network: NetworkName,
  params: Record<string, string>,
): Promise<unknown> => {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    throw new Error('ETHERSCAN_API_KEY is required in the environment');
  }
  const url = new URL(ETHERSCAN_API_BASE);
  Object.entries({ ...params, apikey: apiKey, chainid: CHAIN_ID_BY_NETWORK[network] }).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Etherscan request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
};

const isTransferInput = (input: string): boolean =>
  typeof input === 'string' && input.toLowerCase().startsWith(DEFAULT_CONFIG.transferSelector);

const isSuccessfulTx = (tx: EtherscanTx): boolean => {
  const isError = tx.isError ? tx.isError === '0' : true;
  const receiptOk = tx.txreceipt_status ? tx.txreceipt_status === '1' : true;
  return isError && receiptOk;
};

const parseTransferInput = (input: string): { recipient: `0x${string}`; amount: `0x${string}` } => {
  const data = input.startsWith('0x') ? input.slice(2) : input;
  const selector = data.slice(0, 8);
  if (selector.toLowerCase() !== DEFAULT_CONFIG.transferSelector.slice(2)) {
    throw new Error('Input data does not match transfer selector');
  }
  const recipientWord = data.slice(8, 72);
  const amountWord = data.slice(72, 136);
  const recipient = `0x${recipientWord.slice(24)}` as `0x${string}`;
  const amount = `0x${amountWord}` as `0x${string}`;
  return { recipient, amount };
};

const randomAddress = (): `0x${string}` =>
  `0x${randomBytes(20).toString('hex')}` as `0x${string}`;

const formatSmallHex = (value: bigint): `0x${string}` => {
  let hex = value.toString(16);
  if (hex.length % 2 !== 0) {
    hex = `0${hex}`;
  }
  return `0x${hex}` as `0x${string}`;
};

const hexToSafeNumber = (value: `0x${string}`): number => {
  const numeric = BigInt(value);
  if (numeric > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      `userStorageSlots value exceeds MAX_SAFE_INTEGER: ${value}. Specify how to store large slot values.`,
    );
  }
  return Number(numeric);
};

type StepLogEntry = {
  stack: string[];
  pc: number;
  opcode: string;
  keccak256Input?: string[];
};

const stacksEqual = (a: string[], b: string[]) => {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};

const stackTailEqual = (a: string[], b: string[], startIndex: number) => {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = startIndex; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};

const parseOpcodeIndex = (opcode: string, prefix: string) => {
  if (!opcode.startsWith(prefix)) {
    return null;
  }
  const raw = opcode.slice(prefix.length);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    return null;
  }
  return parsed;
};

const BINARY_OPCODES = new Set<string>([
  'ADD',
  'MUL',
  'SUB',
  'DIV',
  'SDIV',
  'MOD',
  'SMOD',
  'EXP',
  'SIGNEXTEND',
  'LT',
  'GT',
  'SLT',
  'SGT',
  'EQ',
  'AND',
  'OR',
  'XOR',
  'BYTE',
  'SHL',
  'SHR',
  'SAR',
]);

type KeyOrigin =
  | { type: 'push32' }
  | { type: 'keccak256'; keccakInput?: `0x${string}` }
  | { type: 'unknown' };

const traceKeyOrigin = (entries: StepLogEntry[], sloadIndex: number): KeyOrigin => {
  let position = 0;
  for (let i = sloadIndex - 1; i >= 0; i -= 1) {
    const op = entries[i]?.opcode ?? '';
    const pre = entries[i]?.stack ?? [];
    const post = entries[i + 1]?.stack ?? [];

    const pushIndex = parseOpcodeIndex(op, 'PUSH');
    if (pushIndex !== null) {
      if (position === 0) {
        return op === 'PUSH32' ? { type: 'push32' } : { type: 'unknown' };
      }
      position -= 1;
      continue;
    }

    const dupIndex = parseOpcodeIndex(op, 'DUP');
    if (dupIndex !== null) {
      if (position === 0) {
        position = dupIndex - 1;
      } else {
        position -= 1;
      }
      continue;
    }

    const swapIndex = parseOpcodeIndex(op, 'SWAP');
    if (swapIndex !== null) {
      if (position === 0) {
        position = swapIndex;
      } else if (position === swapIndex) {
        position = 0;
      }
      continue;
    }

    if (op === 'KECCAK256') {
      if (position === 0) {
        const keccakInput = entries[i]?.keccak256Input?.[1] as `0x${string}` | undefined;
        return { type: 'keccak256', keccakInput };
      }
      position += 1;
      continue;
    }

    if (op === 'POP') {
      position += 1;
      continue;
    }

    if (BINARY_OPCODES.has(op)) {
      if (pre.length !== post.length + 1) {
        return { type: 'unknown' };
      }
      if (position === 0) {
        const postTop = post[0];
        if (postTop && postTop === pre[0]) {
          position = 0;
          continue;
        }
        if (postTop && postTop === pre[1]) {
          position = 1;
          continue;
        }
        return { type: 'unknown' };
      }
      position += 1;
      continue;
    }

    if (pre.length > 0 && stackTailEqual(pre, post, 1)) {
      if (position === 0) {
        if (pre[0] === post[0]) {
          continue;
        }
        return { type: 'unknown' };
      }
      continue;
    }

    if (stacksEqual(pre, post)) {
      continue;
    }

    return { type: 'unknown' };
  }

  return { type: 'unknown' };
};

const collectPreAllocatedKeysFromStepLog = async (logPath: string) => {
  const raw = await fs.readFile(logPath, 'utf8');
  const entries = JSON.parse(raw) as StepLogEntry[];
  const smallKeys: `0x${string}`[] = [];
  const push32Keys: `0x${string}`[] = [];
  const keccakSlots: number[] = [];
  const invalidOrigins: `0x${string}`[] = [];

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!entry || entry.opcode !== 'SLOAD') {
      continue;
    }
    const key = entry.stack?.[0];
    if (!key || !key.startsWith('0x')) {
      continue;
    }
    try {
      const value = BigInt(key);
      if (value <= 0xffffffffn) {
        smallKeys.push(formatSmallHex(value));
      } else {
        const origin = traceKeyOrigin(entries, i);
        if (origin.type === 'push32') {
          push32Keys.push(formatSmallHex(value));
        } else if (origin.type === 'keccak256') {
          if (origin.keccakInput) {
            keccakSlots.push(hexToSafeNumber(origin.keccakInput));
          } else {
            invalidOrigins.push(formatSmallHex(value));
          }
        } else {
          invalidOrigins.push(formatSmallHex(value));
        }
      }
    } catch {
      // Ignore malformed stack values.
    }
  }

  return { smallKeys, push32Keys, keccakSlots, invalidOrigins };
};

const mergeUniqueHexValues = (existing: `0x${string}`[], incoming: `0x${string}`[]) => {
  const seen = new Set<string>();
  const merged: `0x${string}`[] = [];
  for (const value of [...existing, ...incoming]) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(value);
  }
  return merged;
};

const mergeUniqueSlots = (existing: number[], incoming: number[]) => {
  const seen = new Set<number>();
  const merged: number[] = [];
  for (const value of [...existing, ...incoming]) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    merged.push(value);
  }
  return merged;
};

const filterHexStrings = (value: unknown): `0x${string}`[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is `0x${string}` => typeof entry === 'string' && entry.startsWith('0x'));
};

const filterNonZeroAddresses = (addresses: `0x${string}`[]) =>
  addresses.filter((entry) => entry.toLowerCase() !== ZERO_ADDRESS);

const updatePreAllocatedKeys = async (
  config: Erc20TransferConfig,
  outputPath: string,
  incoming: `0x${string}`[],
) => {
  const merged = mergeUniqueHexValues(config.preAllocatedKeys, incoming);
  const added = merged.length - config.preAllocatedKeys.length;
  if (added > 0) {
    const next = { ...config, preAllocatedKeys: merged };
    await writeConfig(outputPath, next);
    console.log(`Added preAllocatedKeys: ${added}`);
    return next;
  }
  console.log('No preAllocatedKeys collected from SLOAD logs.');
  return config;
};

const updateUserStorageSlots = async (
  config: Erc20TransferConfig,
  outputPath: string,
  incoming: number[],
) => {
  if (incoming.length === 0) {
    return config;
  }
  const merged = mergeUniqueSlots(config.userStorageSlots, incoming);
  const added = merged.length - config.userStorageSlots.length;
  if (added > 0) {
    const next = { ...config, userStorageSlots: merged };
    await writeConfig(outputPath, next);
    console.log(`Added userStorageSlots from KECCAK256: ${added}`);
    return next;
  }
  console.log('No new userStorageSlots collected from KECCAK256.');
  return config;
};

const updateCallCodeAddresses = async (
  config: Erc20TransferConfig,
  outputPath: string,
  incoming: `0x${string}`[],
) => {
  const filteredIncoming = filterNonZeroAddresses(incoming);
  if (filteredIncoming.length === 0) {
    return config;
  }
  const merged = mergeUniqueHexValues(config.callCodeAddresses, filteredIncoming);
  const normalizedCallCodes = normalizeCallCodeAddresses(config.contractAddress, merged);
  const added = normalizedCallCodes.length - config.callCodeAddresses.length;
  const next = { ...config, callCodeAddresses: normalizedCallCodes };
  if (added > 0) {
    await writeConfig(outputPath, next);
    console.log(`Added callCodeAddresses from message_code_addresses.json: ${added}`);
  } else {
    console.log('No new callCodeAddresses collected from message_code_addresses.json.');
  }
  return next;
};

const STORAGE_KEY_ERROR_MESSAGES = [
  BufferErrorMessage.UnregisteredContractStorageWrite.trim(),
  BufferErrorMessage.UnregisteredContractStorageRead.trim(),
];

const hasStorageKeyErrors = async (): Promise<boolean> => {
  try {
    const raw = await fs.readFile(INSTANCE_DESCRIPTION_PATH, 'utf8');
    const parsed = JSON.parse(raw) as { a_pub_function_description?: unknown };
    const entries = Array.isArray(parsed?.a_pub_function_description)
      ? parsed.a_pub_function_description
      : [];
    return entries.some(
      (entry) =>
        typeof entry === 'string'
        && STORAGE_KEY_ERROR_MESSAGES.some((message) => entry.includes(message)),
    );
  } catch {
    return false;
  }
};

const buildParticipants = (
  count: number,
  senderIndex: number,
  recipientIndex: number,
  existing: ParticipantEntry[] = [],
): ParticipantEntry[] => {
  const participants: ParticipantEntry[] = Array.from({ length: count }, (_, index) => ({
    addressL1: existing[index]?.addressL1 ?? randomAddress(),
    prvSeedL2: existing[index]?.prvSeedL2 ?? `Participant ${index + 1}`,
  }));

  if (participants[senderIndex]) {
    participants[senderIndex].prvSeedL2 = "Sender's L2 wallet";
  }
  if (participants[recipientIndex]) {
    participants[recipientIndex].prvSeedL2 = "Recipient's L2 wallet";
  }

  return participants;
};

const normalizeCallCodeAddresses = (
  contractAddress: `0x${string}` | '',
  existing: (`0x${string}`)[] = [],
): `0x${string}`[] => {
  if (!contractAddress) {
    return filterNonZeroAddresses(existing);
  }
  const normalized = contractAddress.toLowerCase();
  const rest = filterNonZeroAddresses(
    existing.slice(1).filter((entry) => entry.toLowerCase() !== normalized),
  );
  return [contractAddress, ...rest];
};

const fetchLatestSuccessfulTransferTx = async (
  network: NetworkName,
  contractAddress: `0x${string}`,
): Promise<EtherscanTx> => {
  const addressLower = contractAddress.toLowerCase();

  for (let page = 1; page <= 20; page += 1) {
    const response = await fetchFromEtherscan(network, {
      module: 'account',
      action: 'txlist',
      address: contractAddress,
      startblock: '0',
      endblock: '99999999',
      page: String(page),
      offset: '100',
      sort: 'desc',
    }) as EtherscanResponse;

    if (response.status === '0' && typeof response.result === 'string') {
      throw new Error(`Etherscan error: ${response.message} (${response.result})`);
    }

    const result = Array.isArray(response.result) ? response.result : [];
    if (result.length === 0) {
      break;
    }

    const match = result.find((tx) => {
      if (!tx.to) {
        return false;
      }
      return tx.to.toLowerCase() === addressLower && isTransferInput(tx.input) && isSuccessfulTx(tx);
    });

    if (match) {
      return match;
    }
  }

  throw new Error('No successful transfer transactions found for this contract.');
};

const promptForBaseInputs = async (): Promise<BaseInputs> => {
  const baseAnswers = await inquirer.prompt([
    {
      name: 'network',
      type: 'list',
      message: 'Network',
      choices: ['sepolia', 'mainnet'],
      default: 'sepolia',
    },
    {
      name: 'contractAddress',
      type: 'input',
      message: 'Token contract address (L1)',
      default: DEFAULT_CONFIG.contractAddress,
      validate: (value: string) => {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
          return 'Contract address is required';
        }
        if (!trimmed.startsWith('0x') || trimmed.length !== 42) {
          return 'Contract address must be a 42-char hex string (0x...)';
        }
        return true;
      },
    },
    {
      name: 'participantCount',
      type: 'number',
      message: 'Participant count',
      default: 2,
      validate: (value: number) => (Number.isInteger(value) && value >= 2 ? true : 'Must be >= 2'),
    },
    {
      name: 'maxIterations',
      type: 'number',
      message: 'Max analysis iterations',
      default: DEFAULT_MAX_ANALYSIS_ITERATIONS,
      validate: (value: number) => (Number.isInteger(value) && value >= 1 ? true : 'Must be >= 1'),
    },
  ]);

  const participantCount = Math.max(2, Math.floor(Number(baseAnswers.participantCount)));

  const senderAnswer = await inquirer.prompt([
    {
      name: 'senderIndex',
      type: 'number',
      message: 'Sender index (optional)',
      default: DEFAULT_CONFIG.senderIndex,
      validate: (value: number) => {
        if (!Number.isInteger(value) || value < 0) {
          return 'Sender index must be a non-negative integer';
        }
        if (value >= participantCount) {
          return `Sender index must be < participant count (${participantCount})`;
        }
        return true;
      },
    },
  ]);

  const recipientAnswer = await inquirer.prompt([
    {
      name: 'recipientIndex',
      type: 'number',
      message: 'Recipient index (optional)',
      default: DEFAULT_CONFIG.recipientIndex,
      validate: (value: number) => {
        if (!Number.isInteger(value) || value < 0) {
          return 'Recipient index must be a non-negative integer';
        }
        if (value >= participantCount) {
          return `Recipient index must be < participant count (${participantCount})`;
        }
        if (value === Number(senderAnswer.senderIndex)) {
          return 'Recipient index must be different from sender index';
        }
        return true;
      },
    },
  ]);

  return {
    network: baseAnswers.network as NetworkName,
    contractAddress: toHexString(String(baseAnswers.contractAddress)),
    participantCount,
    maxIterations: Number(baseAnswers.maxIterations),
    senderIndex: Number(senderAnswer.senderIndex),
    recipientIndex: Number(recipientAnswer.recipientIndex),
  };
};

const buildConfig = async (baseOverride?: BaseInputs): Promise<{
  network: NetworkName;
  config: Erc20TransferConfig;
  maxIterations: number;
}> => {
  const base = baseOverride ?? await promptForBaseInputs();
  const participantCount = Math.max(2, Math.floor(base.participantCount));

  const participants = buildParticipants(
    participantCount,
    base.senderIndex,
    base.recipientIndex,
  );

  return {
    network: base.network,
    config: {
      ...DEFAULT_CONFIG,
      participants,
      contractAddress: base.contractAddress,
      network: base.network,
      senderIndex: base.senderIndex,
      recipientIndex: base.recipientIndex,
      callCodeAddresses: normalizeCallCodeAddresses(base.contractAddress, DEFAULT_CONFIG.callCodeAddresses),
    },
    maxIterations: Math.max(1, Math.floor(base.maxIterations)),
  };
};

const runPipeline = async (outputPath: string, finalPath: string, baseOverride?: BaseInputs) => {
  const { network, config, maxIterations } = await buildConfig(baseOverride);
  let workingConfig = { ...config };
  const workingNetwork = network;

  await writeConfig(outputPath, workingConfig);

  if (!workingConfig.contractAddress) {
    throw new Error('Contract address is required before fetching from Etherscan.');
  }
  const latestTx = await fetchLatestSuccessfulTransferTx(
    workingNetwork,
    workingConfig.contractAddress,
  );
  const { recipient, amount } = parseTransferInput(latestTx.input);
  const blockNumber = Math.max(0, Number(latestTx.blockNumber) - 1);

  const participants = [...workingConfig.participants];
  const senderIndex = workingConfig.senderIndex ?? 0;
  const recipientIndex = workingConfig.recipientIndex ?? 1;
  if (participants.length < 2) {
    throw new Error('participants must include at least sender and recipient entries');
  }
  if (!participants[senderIndex] || !participants[recipientIndex]) {
    throw new Error('senderIndex/recipientIndex must be within participants array length');
  }

  participants[senderIndex] = {
    ...participants[senderIndex],
    addressL1: toHexString(latestTx.from),
  };
  participants[recipientIndex] = {
    ...participants[recipientIndex],
    addressL1: recipient,
  };

  workingConfig = {
    ...workingConfig,
    participants,
    blockNumber,
    amount,
    txHash: toHexString(latestTx.hash),
  };

  console.log(`Latest transfer tx: ${latestTx.hash}`);
  console.log(`Block number: ${blockNumber}`);

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    await writeConfig(outputPath, workingConfig);
    await runExample(outputPath);

    const { smallKeys, push32Keys, keccakSlots, invalidOrigins } = await collectPreAllocatedKeysFromStepLog(STEP_LOG_PATH);
    if (invalidOrigins.length > 0) {
      throw new Error(
        `SLOAD keys larger than 4 bytes with unsupported origin: ${invalidOrigins.join(', ')}`,
      );
    }

    const beforePreAllocated = workingConfig.preAllocatedKeys.length;
    const beforeSlots = workingConfig.userStorageSlots.length;
    const beforeCallCodes = workingConfig.callCodeAddresses.length;

    workingConfig = await updatePreAllocatedKeys(workingConfig, outputPath, [...smallKeys, ...push32Keys]);
    workingConfig = await updateUserStorageSlots(workingConfig, outputPath, keccakSlots);
    try {
      const raw = await fs.readFile(MESSAGE_CODE_ADDRESSES_PATH, 'utf8');
      const normalized = filterNonZeroAddresses(filterHexStrings(JSON.parse(raw)));
      workingConfig = await updateCallCodeAddresses(workingConfig, outputPath, normalized);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        console.log(`File not found, skipping update of callCodeAddresses: ${MESSAGE_CODE_ADDRESSES_PATH}`);
      } else {
        throw new Error(`Failed to process ${MESSAGE_CODE_ADDRESSES_PATH}: ${err.message}`);
      }
    }

    const changed =
      workingConfig.preAllocatedKeys.length !== beforePreAllocated
      || workingConfig.userStorageSlots.length !== beforeSlots
      || workingConfig.callCodeAddresses.length !== beforeCallCodes;

    const storageKeyErrors = await hasStorageKeyErrors();

    if (!changed) {
      if (storageKeyErrors) {
        if (iteration === maxIterations) {
          throw new Error(`Configuration not fully resolved after ${maxIterations} iterations.`);
        }
        continue;
      }
      break;
    }

    if (iteration === maxIterations) {
      throw new Error(`Configuration not fully resolved after ${maxIterations} iterations.`);
    }
  }

  await finalizeConfig(workingConfig, outputPath, finalPath);
};

const main = async () => {
  const { outputPath, finalPath, baseInputs } = parseCliInputs();
  await runPipeline(outputPath, finalPath, baseInputs);
};

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
