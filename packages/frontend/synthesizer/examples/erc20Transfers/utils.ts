import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { bytesToHex, concatBytes, hexToBytes, setLengthLeft, utf8ToBytes } from '@ethereumjs/util';
import type { EdwardsPoint } from '@noble/curves/abstract/edwards';
import { jubjub } from '@noble/curves/misc.js';
import { ethers } from 'ethers';
import type {
  ChannelFunctionConfig,
  ChannelStateConfig,
  CreateStateManagerOptsFromChannelConfigOptions,
  ChannelParticipantConfig,
  ChannelStorageConfig,
} from 'tokamak-l2js';
import {
  deriveL2KeysFromSignature,
  fromEdwardsToAddress,
} from 'tokamak-l2js';
import { getRpcUrlFromEnv } from '../../src/interface/node/env.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..', '..');
const envPath = path.join(packageRoot, '.env');

dotenv.config({ path: envPath });

export const EXAMPLES_ENV_PATH = envPath;
export const ANVIL_RPC_URL_ENV_KEY = 'ANVIL_RPC_URL';
export const DEFAULT_ANVIL_RPC_URL = 'http://127.0.0.1:8545';

export type ExampleErc20TransferConfig = ChannelStateConfig & {
  txNonce: number;
  senderIndex: number;
  recipientIndex: number;
  amount: `0x${string}`;
  function: ChannelFunctionConfig;
  referenceTxHash?: `0x${string}`;
};

export type ExampleNetwork = ExampleErc20TransferConfig['network'];

export type DerivedParticipantKeys = {
  privateKeys: Uint8Array[];
  publicKeys: EdwardsPoint[];
};

const parseHexString = (value: unknown, label: string): `0x${string}` => {
  if (typeof value !== 'string' || !value.startsWith('0x')) {
    throw new Error(`${label} must be a hex string with 0x prefix`);
  }
  return value as `0x${string}`;
};

const parseNetwork = (value: unknown, label: string): ExampleNetwork => {
  if (value !== 'mainnet' && value !== 'sepolia' && value !== 'anvil') {
    throw new Error(`${label} must be one of "mainnet", "sepolia", or "anvil"`);
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

const assertFunctionConfig = (value: unknown, label: string): ChannelFunctionConfig => {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  return {
    selector: parseHexString(record.selector, `${label}.selector`),
    entryContractAddress: parseHexString(record.entryContractAddress, `${label}.entryContractAddress`),
  };
};

export const loadConfig = async (configPath: string): Promise<ExampleErc20TransferConfig> => {
  const configRaw = JSON.parse(await fs.readFile(configPath, 'utf8'));

  const participants = assertParticipantArray(configRaw.participants, 'participants');
  if (participants.length < 2) {
    throw new Error('participants must include at least sender and recipient entries');
  }
  const storageConfigs = assertStorageConfigs(configRaw.storageConfigs, 'storageConfigs');
  const callCodeAddresses = assertStringArray(configRaw.callCodeAddresses, 'callCodeAddresses').map(
    (entry) => parseHexString(entry, 'callCodeAddresses'),
  );

  return {
    network: parseNetwork(configRaw.network, 'network'),
    participants,
    storageConfigs,
    callCodeAddresses,
    blockNumber: parseNumberValue(configRaw.blockNumber, 'blockNumber'),
    txNonce: parseNumberValue(configRaw.txNonce, 'txNonce'),
    amount: parseHexString(configRaw.amount, 'amount'),
    senderIndex: parseNumberValue(configRaw.senderIndex, 'senderIndex'),
    recipientIndex: parseNumberValue(configRaw.recipientIndex, 'recipientIndex'),
    function: assertFunctionConfig(configRaw.function, 'function'),
    referenceTxHash:
      configRaw.referenceTxHash === undefined
        ? undefined
        : parseHexString(configRaw.referenceTxHash, 'referenceTxHash'),
  };
};

export const toSeedBytes = (seed: string): Uint8Array => setLengthLeft(utf8ToBytes(seed), 32);

export const deriveParticipantKeys = (
  participants: ChannelParticipantConfig[],
): DerivedParticipantKeys => {
  const privateKeys: Uint8Array[] = [];
  const publicKeys: EdwardsPoint[] = [];

  for (const participant of participants) {
    const signature = bytesToHex(jubjub.utils.randomPrivateKey(toSeedBytes(participant.prvSeedL2)));
    const keySet = deriveL2KeysFromSignature(signature);
    privateKeys.push(keySet.privateKey);
    publicKeys.push(jubjub.Point.fromBytes(keySet.publicKey));
  }

  return { privateKeys, publicKeys };
};

const assertParticipantIndex = (
  config: ExampleErc20TransferConfig,
  index: number,
  label: 'senderIndex' | 'recipientIndex',
  keyMaterial: DerivedParticipantKeys,
) => {
  if (!Number.isInteger(index) || index < 0 || index >= config.participants.length) {
    throw new Error(`${label} must point to an existing participant`);
  }
  if (!keyMaterial.publicKeys[index] || !keyMaterial.privateKeys[index]) {
    throw new Error(`${label} did not resolve to a derived participant key`);
  }
};

export const buildErc20Calldata = (
  config: ExampleErc20TransferConfig,
  keyMaterial: DerivedParticipantKeys,
): Uint8Array => {
  assertParticipantIndex(config, config.senderIndex, 'senderIndex', keyMaterial);
  assertParticipantIndex(config, config.recipientIndex, 'recipientIndex', keyMaterial);

  const recipientAddress = fromEdwardsToAddress(keyMaterial.publicKeys[config.recipientIndex]);
  return concatBytes(
    setLengthLeft(hexToBytes(config.function.selector), 4),
    setLengthLeft(recipientAddress.toBytes(), 32),
    setLengthLeft(hexToBytes(config.amount), 32),
  );
};

export const toStateManagerChannelConfig = (
  config: ExampleErc20TransferConfig,
): ChannelStateConfig & Pick<ExampleErc20TransferConfig, 'function'> => ({
  network: config.network,
  participants: config.participants,
  storageConfigs: config.storageConfigs,
  callCodeAddresses: config.callCodeAddresses,
  blockNumber: config.blockNumber,
  function: config.function,
});

export const getExampleRpcUrl = (network: ExampleNetwork, env: NodeJS.ProcessEnv = process.env): string => {
  if (network === 'anvil') {
    const configuredRpcUrl = env[ANVIL_RPC_URL_ENV_KEY]?.trim();
    return configuredRpcUrl && configuredRpcUrl.length > 0 ? configuredRpcUrl : DEFAULT_ANVIL_RPC_URL;
  }

  return getRpcUrlFromEnv(network, env, { envPath: EXAMPLES_ENV_PATH });
};

export const getStateManagerOptsOptions = async (
  network: ExampleNetwork,
  rpcUrl: string,
): Promise<CreateStateManagerOptsFromChannelConfigOptions> => {
  if (network !== 'anvil') {
    return {};
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const chainId = Number((await provider.getNetwork()).chainId);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error(`Unsupported Anvil chain ID: ${chainId}`);
  }
  return { anvilChainId: chainId };
};
