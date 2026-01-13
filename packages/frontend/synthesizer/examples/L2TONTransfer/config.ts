import { promises as fs } from 'fs';

export type L2TONTransferConfig = {
  blockNumber: number;
  privateKeySeedsL2: string[];
  addressListL1: `0x${string}`[];
  contractAddress: `0x${string}`;
  transferSelector: `0x${string}`;
  userStorageSlots: number[];
  initStorageKey: `0x${string}`;
  txsData: {
    nonce: bigint;
    senderIndex: number;
    recipientIndex: number;
    amount: `0x${string}`;
  }[];
};

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

const assertNumberArray = (value: unknown, label: string): number[] => {
  if (!Array.isArray(value) || !value.every((entry) => Number.isInteger(entry))) {
    throw new Error(`${label} must be an array of integers`);
  }
  return value;
};

export const loadConfig = async (configPath: string): Promise<L2TONTransferConfig> => {
  const configRaw = JSON.parse(await fs.readFile(configPath, 'utf8'));

  const privateKeySeedsL2 = assertStringArray(configRaw.privateKeySeedsL2, 'privateKeySeedsL2');
  const addressListL1 = assertStringArray(configRaw.addressListL1, 'addressListL1').map((address) => {
    if (!address.startsWith('0x')) {
      throw new Error('addressListL1 entries must be hex strings with 0x prefix');
    }
    return address as `0x${string}`;
  });

  if (privateKeySeedsL2.length !== addressListL1.length) {
    throw new Error('privateKeySeedsL2 and addressListL1 must have the same length');
  }
  if (privateKeySeedsL2.length < 2) {
    throw new Error('privateKeySeedsL2 must include at least sender and recipient seeds');
  }

  const txsDataRaw = configRaw.txsData;
  if (!Array.isArray(txsDataRaw) || txsDataRaw.length === 0) {
    throw new Error('txsData must be a non-empty array');
  }

  const txsData = txsDataRaw.map((txData, index) => {
    if (txData === null || typeof txData !== 'object') {
      throw new Error(`txsData[${index}] must be an object`);
    }
    const txRecord = txData as Record<string, unknown>;
    const senderIndex = parseNumberValue(txRecord.senderIndex, `txsData[${index}].senderIndex`);
    const recipientIndex = parseNumberValue(txRecord.recipientIndex, `txsData[${index}].recipientIndex`);
    if (senderIndex < 0 || senderIndex >= privateKeySeedsL2.length) {
      throw new Error(`txsData[${index}].senderIndex out of range`);
    }
    if (recipientIndex < 0 || recipientIndex >= privateKeySeedsL2.length) {
      throw new Error(`txsData[${index}].recipientIndex out of range`);
    }
    return {
      nonce: parseBigIntValue(txRecord.nonce, `txsData[${index}].nonce`),
      senderIndex,
      recipientIndex,
      amount: parseHexString(txRecord.amount, `txsData[${index}].amount`),
    };
  });

  return {
    privateKeySeedsL2,
    addressListL1,
    userStorageSlots: assertNumberArray(configRaw.userStorageSlots, 'userStorageSlots'),
    initStorageKey: parseHexString(configRaw.initStorageKey, 'initStorageKey'),
    blockNumber: parseNumberValue(configRaw.blockNumber, 'blockNumber'),
    contractAddress: parseHexString(configRaw.contractAddress, 'contractAddress'),
    transferSelector: parseHexString(configRaw.transferSelector, 'transferSelector'),
    txsData,
  };
};
