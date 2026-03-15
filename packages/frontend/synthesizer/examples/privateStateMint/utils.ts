import { promises as fs, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hexToBytes, setLengthLeft, utf8ToBytes } from '@ethereumjs/util';
import type { EdwardsPoint } from '@noble/curves/abstract/edwards';
import { jubjub } from '@noble/curves/misc.js';
import { ethers } from 'ethers';
import type {
  ChannelFunctionConfig,
  ChannelParticipantConfig,
  ChannelStateConfig,
  ChannelStorageConfig,
  CreateStateManagerOptsFromChannelConfigOptions,
} from 'tokamak-l2js';
import { deriveL2KeysFromSignature, fromEdwardsToAddress } from 'tokamak-l2js';
import { getRpcUrlFromEnv } from '../../src/interface/node/env.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..', '..');
const envPath = path.join(packageRoot, '.env');

const applyEnvFileIfPresent = (targetPath: string) => {
  try {
    const contents = readFileSync(targetPath, 'utf8');
    for (const rawLine of contents.split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith('#')) {
        continue;
      }
      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/gu, '');
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
};

applyEnvFileIfPresent(envPath);

export const EXAMPLES_ENV_PATH = envPath;
export const ANVIL_RPC_URL_ENV_KEY = 'ANVIL_RPC_URL';
export const DEFAULT_ANVIL_RPC_URL = 'http://127.0.0.1:8545';

export type PrivateStateMintConfig = ChannelStateConfig & {
  network: 'mainnet' | 'sepolia' | 'anvil';
  txNonce: number;
  senderIndex: number;
  noteOwnerIndex: number;
  noteValue: `0x${string}`;
  noteSalt: `0x${string}`;
  function: ChannelFunctionConfig;
};

export type ExampleNetwork = PrivateStateMintConfig['network'];

export type DerivedParticipantKeys = {
  privateKeys: Uint8Array[];
  publicKeys: EdwardsPoint[];
};

const MINT_NOTES1_ABI = [
  'function mintNotes1((address owner,uint256 value,bytes32 salt)[1] outputs) returns (bytes32[1] commitments)',
];

export const mintNotes1Interface = new ethers.Interface(MINT_NOTES1_ABI);

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
        (item) => parseHexString(item, `${label}[${index}].preAllocatedKeys`),
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

export const loadConfig = async (configPath: string): Promise<PrivateStateMintConfig> => {
  const configRaw = JSON.parse(await fs.readFile(configPath, 'utf8'));

  const participants = assertParticipantArray(configRaw.participants, 'participants');
  if (participants.length < 2) {
    throw new Error('participants must include at least two entries');
  }

  return {
    network: parseNetwork(configRaw.network, 'network'),
    participants,
    storageConfigs: assertStorageConfigs(configRaw.storageConfigs, 'storageConfigs'),
    entryContractAddress: parseHexString(
      configRaw.entryContractAddress ?? configRaw.function?.entryContractAddress,
      'entryContractAddress',
    ),
    callCodeAddresses: assertStringArray(configRaw.callCodeAddresses, 'callCodeAddresses').map(
      (entry) => parseHexString(entry, 'callCodeAddresses'),
    ),
    blockNumber: parseNumberValue(configRaw.blockNumber, 'blockNumber'),
    txNonce: parseNumberValue(configRaw.txNonce, 'txNonce'),
    senderIndex: parseNumberValue(configRaw.senderIndex, 'senderIndex'),
    noteOwnerIndex: parseNumberValue(configRaw.noteOwnerIndex, 'noteOwnerIndex'),
    noteValue: parseHexString(configRaw.noteValue, 'noteValue'),
    noteSalt: parseHexString(configRaw.noteSalt, 'noteSalt'),
    function: assertFunctionConfig(configRaw.function, 'function'),
  };
};

const toSeedBytes = (seed: string): Uint8Array =>
  setLengthLeft(utf8ToBytes(seed), 32);

export const deriveParticipantKeys = (
  participants: ChannelParticipantConfig[],
): DerivedParticipantKeys => {
  const privateKeys: Uint8Array[] = [];
  const publicKeys: EdwardsPoint[] = [];

  for (const participant of participants) {
    const signature = ethers.hexlify(jubjub.utils.randomPrivateKey(toSeedBytes(participant.prvSeedL2)));
    const keySet = deriveL2KeysFromSignature(signature);
    privateKeys.push(keySet.privateKey);
    publicKeys.push(jubjub.Point.fromBytes(keySet.publicKey));
  }

  return { privateKeys, publicKeys };
};

const assertParticipantIndex = (
  config: PrivateStateMintConfig,
  index: number,
  label: 'senderIndex' | 'noteOwnerIndex',
  keyMaterial: DerivedParticipantKeys,
) => {
  if (!Number.isInteger(index) || index < 0 || index >= config.participants.length) {
    throw new Error(`${label} must point to an existing participant`);
  }
  if (!keyMaterial.publicKeys[index] || !keyMaterial.privateKeys[index]) {
    throw new Error(`${label} did not resolve to a derived participant key`);
  }
};

export const buildPrivateStateMintCalldata = (
  config: PrivateStateMintConfig,
  keyMaterial: DerivedParticipantKeys,
): Uint8Array => {
  assertParticipantIndex(config, config.senderIndex, 'senderIndex', keyMaterial);
  assertParticipantIndex(config, config.noteOwnerIndex, 'noteOwnerIndex', keyMaterial);

  const noteOwnerAddress = fromEdwardsToAddress(keyMaterial.publicKeys[config.noteOwnerIndex]).toString();

  const encoded = mintNotes1Interface.encodeFunctionData('mintNotes1', [[{
    owner: noteOwnerAddress,
    value: BigInt(config.noteValue),
    salt: config.noteSalt,
  }]]);
  return hexToBytes(encoded as `0x${string}`);
};

export const toStateManagerChannelConfig = (
  config: PrivateStateMintConfig,
): ChannelStateConfig & Pick<PrivateStateMintConfig, 'function'> => ({
  network: config.network,
  participants: config.participants,
  storageConfigs: config.storageConfigs,
  entryContractAddress: config.entryContractAddress,
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
