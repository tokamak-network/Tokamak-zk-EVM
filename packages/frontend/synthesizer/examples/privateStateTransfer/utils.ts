import { promises as fs } from 'fs';
import { ethers } from 'ethers';
import type {
  ChannelFunctionConfig,
  ChannelParticipantConfig,
  ChannelStateConfig,
  ChannelStorageConfig,
} from '../../src/interface/tokamakL2js/index.ts';
import {
  deriveParticipantKeys,
  getExampleRpcUrl,
  getStateManagerOptsOptions,
  type DerivedParticipantKeys,
  type ExampleNetwork,
} from '../privateStateMint/utils.ts';

export type PrivateStateNote = {
  owner: `0x${string}`;
  value: `0x${string}`;
  salt: `0x${string}`;
};

export type PrivateStateTransferConfig = ChannelStateConfig & {
  network: ExampleNetwork;
  txNonce: number;
  calldata: `0x${string}`;
  senderIndex: number;
  inputNotes: [PrivateStateNote, PrivateStateNote, PrivateStateNote, PrivateStateNote];
  outputNotes: [PrivateStateNote, PrivateStateNote, PrivateStateNote];
  function: ChannelFunctionConfig;
};

export {
  deriveParticipantKeys,
  getExampleRpcUrl,
  getStateManagerOptsOptions,
  type DerivedParticipantKeys,
  type ExampleNetwork,
};

const TRANSFER_NOTES4_ABI = [
  'function transferNotes4((address owner,uint256 value,bytes32 salt)[4] inputNotes,(address owner,uint256 value,bytes32 salt)[3] outputs) returns (bytes32[4] nullifiers, bytes32[3] outputCommitments)',
];

export const transferNotes4Interface = new ethers.Interface(TRANSFER_NOTES4_ABI);

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

const parseFixedNotes = <N extends number>(value: unknown, label: string, expectedLength: N): PrivateStateNote[] => {
  if (!Array.isArray(value) || value.length !== expectedLength) {
    throw new Error(`${label} must be an array of length ${expectedLength}`);
  }
  return value.map((entry, index) => parseNote(entry, `${label}[${index}]`));
};

export const loadConfig = async (configPath: string): Promise<PrivateStateTransferConfig> => {
  const configRaw = JSON.parse(await fs.readFile(configPath, 'utf8'));

  const participants = assertParticipantArray(configRaw.participants, 'participants');
  if (participants.length < 3) {
    throw new Error('participants must include at least three entries');
  }

  const inputNotes = parseFixedNotes(configRaw.inputNotes, 'inputNotes', 4) as PrivateStateTransferConfig['inputNotes'];
  const outputNotes = parseFixedNotes(configRaw.outputNotes, 'outputNotes', 3) as PrivateStateTransferConfig['outputNotes'];

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
    inputNotes,
    outputNotes,
    function: assertFunctionConfig(configRaw.function, 'function'),
  };
};

export const buildPrivateStateTransferCalldata = (
  config: PrivateStateTransferConfig,
  _keyMaterial: DerivedParticipantKeys,
): `0x${string}` =>
  transferNotes4Interface.encodeFunctionData('transferNotes4', [config.inputNotes, config.outputNotes]) as `0x${string}`;

export const toStateManagerChannelConfig = (
  config: PrivateStateTransferConfig,
): ChannelStateConfig & Pick<PrivateStateTransferConfig, 'function'> => ({
  network: config.network,
  participants: config.participants,
  storageConfigs: config.storageConfigs,
  callCodeAddresses: config.callCodeAddresses,
  blockNumber: config.blockNumber,
  function: config.function,
});
