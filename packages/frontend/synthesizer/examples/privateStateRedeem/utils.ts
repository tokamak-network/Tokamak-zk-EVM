import { promises as fs } from 'fs';
import { ethers } from 'ethers';
import type {
  ChannelFunctionConfig,
  ChannelParticipantConfig,
  ChannelStateConfig,
  ChannelStorageConfig,
} from 'tokamak-l2js';
import {
  deriveParticipantKeys,
  getExampleRpcUrl,
  type DerivedParticipantKeys,
  type ExampleNetwork,
} from '../privateStateMint/utils.ts';
import { fromEdwardsToAddress } from 'tokamak-l2js';

export type PrivateStateNote = {
  owner: `0x${string}`;
  value: `0x${string}`;
  salt: `0x${string}`;
};

export type PrivateStateRedeemConfig = ChannelStateConfig & {
  network: ExampleNetwork;
  txNonce: number;
  calldata: `0x${string}`;
  senderIndex: number;
  receiverIndex: number;
  inputCount: 1 | 2 | 3 | 4;
  inputNotes: [PrivateStateNote, ...PrivateStateNote[]];
  function: ChannelFunctionConfig;
};

export {
  deriveParticipantKeys,
  getExampleRpcUrl,
  type DerivedParticipantKeys,
  type ExampleNetwork,
};

const REDEEM_NOTES1_ABI = [
  'function redeemNotes1((address owner,uint256 value,bytes32 salt)[1] inputNotes,address receiver) returns (bytes32[1] nullifiers)',
];
const REDEEM_NOTES2_ABI = [
  'function redeemNotes2((address owner,uint256 value,bytes32 salt)[2] inputNotes,address receiver) returns (bytes32[2] nullifiers)',
];
const REDEEM_NOTES3_ABI = [
  'function redeemNotes3((address owner,uint256 value,bytes32 salt)[3] inputNotes,address receiver) returns (bytes32[3] nullifiers)',
];
const REDEEM_NOTES4_ABI = [
  'function redeemNotes4((address owner,uint256 value,bytes32 salt)[4] inputNotes,address receiver) returns (bytes32[4] nullifiers)',
];

export const redeemInterfaces = {
  1: new ethers.Interface(REDEEM_NOTES1_ABI),
  2: new ethers.Interface(REDEEM_NOTES2_ABI),
  3: new ethers.Interface(REDEEM_NOTES3_ABI),
  4: new ethers.Interface(REDEEM_NOTES4_ABI),
} as const;

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

const parseInputCount = (value: unknown, label: string): 1 | 2 | 3 | 4 => {
  const parsed = parseNumberValue(value, label);
  if (parsed !== 1 && parsed !== 2 && parsed !== 3 && parsed !== 4) {
    throw new Error(`${label} must be 1, 2, 3, or 4`);
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

const parseNote = (value: unknown, label: string): PrivateStateNote => {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  return {
    owner: parseHexString(record.owner, `${label}.owner`) as `0x${string}`,
    value: parseHexString(record.value, `${label}.value`),
    salt: parseHexString(record.salt, `${label}.salt`),
  };
};

const parseFixedNotes = (value: unknown, label: string, expectedLength: number): PrivateStateNote[] => {
  if (!Array.isArray(value) || value.length !== expectedLength) {
    throw new Error(`${label} must be an array of length ${expectedLength}`);
  }
  return value.map((entry, index) => parseNote(entry, `${label}[${index}]`));
};

export const loadConfig = async (configPath: string): Promise<PrivateStateRedeemConfig> => {
  const configRaw = JSON.parse(await fs.readFile(configPath, 'utf8'));

  const participants = assertParticipantArray(configRaw.participants, 'participants');
  if (participants.length < 2) {
    throw new Error('participants must include at least two entries');
  }
  const inputCount = parseInputCount(configRaw.inputCount, 'inputCount');

  return {
    network: parseNetwork(configRaw.network, 'network'),
    participants,
    storageConfigs: assertStorageConfigs(configRaw.storageConfigs, 'storageConfigs'),
    callCodeAddresses: assertStringArray(configRaw.callCodeAddresses, 'callCodeAddresses').map(
      (entry) => parseHexString(entry, 'callCodeAddresses'),
    ),
    blockNumber: parseNumberValue(configRaw.blockNumber, 'blockNumber'),
    txNonce: parseNumberValue(configRaw.txNonce, 'txNonce'),
    calldata: parseHexString(configRaw.calldata, 'calldata'),
    senderIndex: parseNumberValue(configRaw.senderIndex, 'senderIndex'),
    receiverIndex: parseNumberValue(configRaw.receiverIndex, 'receiverIndex'),
    inputCount,
    inputNotes: parseFixedNotes(configRaw.inputNotes, 'inputNotes', inputCount) as PrivateStateRedeemConfig['inputNotes'],
    function: assertFunctionConfig(configRaw.function, 'function'),
  };
};

export const buildPrivateStateRedeemCalldata = (
  config: PrivateStateRedeemConfig,
  keyMaterial: DerivedParticipantKeys,
): `0x${string}` => {
  const receiverPoint = keyMaterial.publicKeys[config.receiverIndex];
  if (!receiverPoint) {
    throw new Error(`receiverIndex must point to an existing participant; got ${config.receiverIndex}`);
  }
  const receiverAddress = fromEdwardsToAddress(receiverPoint).toString() as `0x${string}`;
  const functionName = `redeemNotes${config.inputCount}` as
    | 'redeemNotes1'
    | 'redeemNotes2'
    | 'redeemNotes3'
    | 'redeemNotes4';
  return redeemInterfaces[config.inputCount].encodeFunctionData(
    functionName,
    [config.inputNotes, receiverAddress],
  ) as `0x${string}`;
};

export const toStateManagerChannelConfig = (
  config: PrivateStateRedeemConfig,
): ChannelStateConfig => ({
  network: config.network,
  participants: config.participants,
  storageConfigs: config.storageConfigs,
  callCodeAddresses: config.callCodeAddresses,
  blockNumber: config.blockNumber,
});
