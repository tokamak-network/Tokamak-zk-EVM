import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Common, type CommonOpts, Mainnet, Sepolia } from '@ethereumjs/common';
import { bytesToHex, createAddressFromString, hexToBytes, setLengthLeft, utf8ToBytes } from '@ethereumjs/util';
import { ethers } from 'ethers';
import { jubjub } from '@noble/curves/misc.js';
import type {
  ChannelErc20TransferTxSimulationConfig,
  ChannelParticipantConfig,
  ChannelStorageConfig,
  TokamakL2StateManagerOpts,
} from 'tokamak-l2js';
import { deriveL2KeysFromSignature, fromEdwardsToAddress, getEddsaPublicKey, getUserStorageKey, poseidon } from 'tokamak-l2js';
import { getRpcUrlFromEnv } from '../../src/interface/node/env.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..', '..');
const envPath = path.join(packageRoot, '.env');

dotenv.config({ path: envPath });

export const EXAMPLES_ENV_PATH = envPath;
export const ANVIL_RPC_URL_ENV_KEY = 'ANVIL_RPC_URL';
export const DEFAULT_ANVIL_RPC_URL = 'http://127.0.0.1:8545';

export type ExampleNetwork = 'mainnet' | 'sepolia' | 'anvil';
export type ExampleChannelErc20TransferTxSimulationConfig = Omit<
  ChannelErc20TransferTxSimulationConfig,
  'network'
> & {
  network: ExampleNetwork;
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

export const loadConfig = async (configPath: string): Promise<ExampleChannelErc20TransferTxSimulationConfig> => {
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

export const getExampleRpcUrl = (
  network: ExampleNetwork,
  env: NodeJS.ProcessEnv = process.env,
): string => {
  if (network === 'anvil') {
    const configuredRpcUrl = env[ANVIL_RPC_URL_ENV_KEY]?.trim();
    return configuredRpcUrl && configuredRpcUrl.length > 0 ? configuredRpcUrl : DEFAULT_ANVIL_RPC_URL;
  }

  return getRpcUrlFromEnv(network, env, { envPath: EXAMPLES_ENV_PATH });
};

const createCommonForNetwork = async (network: ExampleNetwork, rpcUrl: string): Promise<Common> => {
  const customCrypto = { keccak256: poseidon, ecrecover: getEddsaPublicKey };
  if (network === 'anvil') {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const rpcNetwork = await provider.getNetwork();
    const chainId = Number(rpcNetwork.chainId);

    if (!Number.isSafeInteger(chainId) || chainId <= 0) {
      throw new Error(`Unsupported Anvil chain ID: ${rpcNetwork.chainId.toString()}`);
    }

    const commonOpts: CommonOpts = {
      chain: {
        ...Mainnet,
        name: 'anvil',
        chainId,
      },
      customCrypto,
    };
    return new Common(commonOpts);
  }

  const chain = network === 'sepolia' ? Sepolia : Mainnet;
  return new Common({
    chain: {
      ...chain,
    },
    customCrypto,
  });
};

export const createStateManagerOptsFromExampleConfig = async (
  config: ExampleChannelErc20TransferTxSimulationConfig,
  rpcUrl: string,
): Promise<TokamakL2StateManagerOpts> => {
  const privateSignatures = config.participants.map((entry) =>
    bytesToHex(jubjub.utils.randomPrivateKey(setLengthLeft(utf8ToBytes(entry.prvSeedL2), 32))),
  );

  const derivedPublicKeyListL2 = privateSignatures.map((signature) => {
    const keySet = deriveL2KeysFromSignature(signature);
    return jubjub.Point.fromBytes(keySet.publicKey);
  });

  const initStorageKeys: NonNullable<TokamakL2StateManagerOpts['initStorageKeys']> = [];
  for (const entryByAddress of config.storageConfigs) {
    const keyPairs: { L1: Uint8Array; L2: Uint8Array }[] = [];
    for (const preAllocatedKey of entryByAddress.preAllocatedKeys) {
      const keyBytes = setLengthLeft(hexToBytes(preAllocatedKey), 32);
      keyPairs.push({ L1: keyBytes, L2: keyBytes });
    }

    for (const slot of entryByAddress.userStorageSlots) {
      for (let userIndex = 0; userIndex < config.participants.length; userIndex += 1) {
        const participant = config.participants[userIndex];
        keyPairs.push({
          L1: getUserStorageKey([participant.addressL1, slot], 'L1'),
          L2: getUserStorageKey([fromEdwardsToAddress(derivedPublicKeyListL2[userIndex]), slot], 'TokamakL2'),
        });
      }
    }

    initStorageKeys.push({
      address: createAddressFromString(entryByAddress.address),
      keyPairs,
    });
  }

  return {
    common: await createCommonForNetwork(config.network, rpcUrl),
    blockNumber: config.blockNumber,
    entryContractAddress: createAddressFromString(config.entryContractAddress),
    initStorageKeys,
    callCodeAddresses: config.callCodeAddresses.map((entry) => createAddressFromString(entry)),
  };
};
