import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { setLengthLeft, utf8ToBytes } from '@ethereumjs/util';
import type {
  ChannelErc20TransferTxSimulationConfig,
  ChannelParticipantConfig,
  ChannelStorageConfig,
} from 'tokamak-l2js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..', '..');
const envPath = path.join(packageRoot, '.env');

dotenv.config({ path: envPath });

export const EXAMPLES_ENV_PATH = envPath;

const parseHexString = (value: unknown, label: string): `0x${string}` => {
  if (typeof value !== 'string' || !value.startsWith('0x')) {
    throw new Error(`${label} must be a hex string with 0x prefix`);
  }
  return value as `0x${string}`;
};

const parseNetwork = (value: unknown, label: string): 'mainnet' | 'sepolia' => {
  if (value !== 'mainnet' && value !== 'sepolia') {
    throw new Error(`${label} must be either "mainnet" or "sepolia"`);
  }
  return value;
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

const assertParticipantArray = (value: unknown, label: string): ChannelParticipantConfig[] => {
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

const assertStorageConfigs = (value: unknown, label: string): ChannelStorageConfig[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`${label}[${index}] must be an object`);
    }
    const record = entry as Record<string, unknown>;
    return {
      address: parseHexString(record.address, `${label}[${index}].address`),
      userStorageSlots: assertUserStorageSlots(record.userStorageSlots, `${label}[${index}].userStorageSlots`),
      preAllocatedKeys: assertStringArray(record.preAllocatedKeys, `${label}[${index}].preAllocatedKeys`).map(
        (entry) => parseHexString(entry, `${label}[${index}].preAllocatedKeys`),
      ),
    };
  });
};

export const loadConfig = async (configPath: string): Promise<ChannelErc20TransferTxSimulationConfig> => {
  const configRaw = JSON.parse(await fs.readFile(configPath, 'utf8'));

  const participants = assertParticipantArray(configRaw.participants, 'participants');
  if (participants.length < 2) {
    throw new Error('participants must include at least sender and recipient entries');
  }
  const storageConfigs = assertStorageConfigs(configRaw.storageConfigs, 'storageConfigs');
  const entryContractAddress = parseHexString(configRaw.entryContractAddress, 'entryContractAddress');
  const callCodeAddresses = assertStringArray(configRaw.callCodeAddresses, 'callCodeAddresses').map(
    (entry) => parseHexString(entry, 'callCodeAddresses'),
  );

  return {
    network: parseNetwork(configRaw.network, 'network'),
    participants,
    storageConfigs,
    entryContractAddress,
    callCodeAddresses,
    blockNumber: parseNumberValue(configRaw.blockNumber, 'blockNumber'),
    txNonce: parseNumberValue(configRaw.txNonce, 'txNonce'),
    amount: parseHexString(configRaw.amount, 'amount'),
    transferSelector: parseHexString(configRaw.transferSelector, 'transferSelector'),
    senderIndex: parseNumberValue(configRaw.senderIndex, 'senderIndex'),
    recipientIndex: parseNumberValue(configRaw.recipientIndex, 'recipientIndex'),
  };
};

export const toSeedBytes = (seed: string): Uint8Array => setLengthLeft(utf8ToBytes(seed), 32);
