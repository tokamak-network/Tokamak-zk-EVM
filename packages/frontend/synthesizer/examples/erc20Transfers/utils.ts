import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { setLengthLeft, utf8ToBytes } from '@ethereumjs/util';

export type ParticipantEntry = {
  addressL1: `0x${string}`;
  prvSeedL2: string;
};

export type Erc20TransferConfig = {
  participants: ParticipantEntry[];
  userStorageSlots: number[];
  preAllocatedKeys: `0x${string}`[];
  txNonce: bigint;
  blockNumber: number;
  network: string;
  txHash: string;
  contractAddress: `0x${string}`;
  amount: `0x${string}`;
  transferSelector: `0x${string}`;
  senderIndex: number;
  recipientIndex: number;
  callCodeAddresses: `0x${string}`[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..', '..');
const RPC_URL_ENV_KEY = 'RPC_URL';

dotenv.config({ path: path.join(packageRoot, '.env') });

const parseHexString = (value: unknown, label: string): `0x${string}` => {
  if (typeof value !== 'string' || !value.startsWith('0x')) {
    throw new Error(`${label} must be a hex string with 0x prefix`);
  }
  return value as `0x${string}`;
};

const parseBigIntValue = (value: unknown, label: string): bigint => {
  if (typeof value === 'string' || typeof value === 'number') {
    return BigInt(value);
  }
  throw new Error(`${label} must be a string or number`);
};

const parseNumberValue = (value: unknown, label: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer`);
  }
  return parsed;
};

const assertStringArray = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value;
};

const assertUserStorageSlots = (value: unknown, label: string): number[] => {
  if (!Array.isArray(value) || !value.every((entry) => Number.isInteger(entry))) {
    throw new Error(`${label} must be an array of integers`);
  }
  return value;
};

export const getRpcUrlFromEnv = (): string => {
  const rpcUrl = process.env[RPC_URL_ENV_KEY];
  if (typeof rpcUrl !== 'string' || rpcUrl.length === 0) {
    throw new Error(`Environment variable ${RPC_URL_ENV_KEY} must be set in ${path.join(packageRoot, '.env')}`);
  }
  return rpcUrl;
};

const assertParticipantArray = (value: unknown, label: string): ParticipantEntry[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`${label}[${index}] must be an object`);
    }
    const record = entry as Record<string, unknown>;
    const addressL1 = record.addressL1;
    const prvSeedL2 = record.prvSeedL2;
    if (typeof addressL1 !== 'string' || !addressL1.startsWith('0x')) {
      throw new Error(`${label}[${index}].addressL1 must be a hex string with 0x prefix`);
    }
    if (typeof prvSeedL2 !== 'string') {
      throw new Error(`${label}[${index}].prvSeedL2 must be a string`);
    }
    return { addressL1: addressL1 as `0x${string}`, prvSeedL2 };
  });
};

export const loadConfig = async (configPath: string): Promise<Erc20TransferConfig> => {
  const configRaw = JSON.parse(await fs.readFile(configPath, 'utf8'));

  const participants = assertParticipantArray(configRaw.participants, 'participants');
  if (participants.length < 2) {
    throw new Error('participants must include at least sender and recipient entries');
  }

  const preAllocatedKeys = assertStringArray(configRaw.preAllocatedKeys, 'preAllocatedKeys').map(
    (entry) => parseHexString(entry, 'preAllocatedKeys'),
  );
  const callCodeAddresses = assertStringArray(configRaw.callCodeAddresses, 'callCodeAddresses').map(
    (entry) => parseHexString(entry, 'callCodeAddresses'),
  );

  return {
    participants,
    userStorageSlots: assertUserStorageSlots(configRaw.userStorageSlots, 'userStorageSlots'),
    preAllocatedKeys,
    txNonce: parseBigIntValue(configRaw.txNonce, 'txNonce'),
    blockNumber: parseNumberValue(configRaw.blockNumber, 'blockNumber'),
    network: typeof configRaw.network === 'string' ? configRaw.network : '',
    txHash: typeof configRaw.txHash === 'string' ? configRaw.txHash : '',
    contractAddress: parseHexString(configRaw.contractAddress, 'contractAddress'),
    amount: parseHexString(configRaw.amount, 'amount'),
    transferSelector: parseHexString(configRaw.transferSelector, 'transferSelector'),
    senderIndex: parseNumberValue(configRaw.senderIndex, 'senderIndex'),
    recipientIndex: parseNumberValue(configRaw.recipientIndex, 'recipientIndex'),
    callCodeAddresses,
  };
};

export const toSeedBytes = (seed: string): Uint8Array => setLengthLeft(utf8ToBytes(seed), 32);
