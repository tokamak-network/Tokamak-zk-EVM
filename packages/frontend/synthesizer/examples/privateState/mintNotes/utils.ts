import { promises as fs, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { bytesToHex, hexToBytes, setLengthLeft, utf8ToBytes } from '@ethereumjs/util';
import type { EdwardsPoint } from '@noble/curves/abstract/edwards';
import { jubjub } from '@noble/curves/misc.js';
import { ethers } from 'ethers';
import type {
  ChannelFunctionConfig,
  ChannelParticipantConfig,
  ChannelStateConfig,
  ChannelStorageConfig,
} from 'tokamak-l2js';
import { deriveL2KeysFromSignature, fromEdwardsToAddress, poseidon } from 'tokamak-l2js';
import { getRpcUrlFromEnv } from '../../../src/interface/node/env.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..', '..', '..');
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
const DEFAULT_CHANNEL_ID = 4;
const BLS12_381_SCALAR_FIELD_MODULUS =
  BigInt('0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001');
const JUBJUB_ORDER = jubjub.CURVE.n;
const MINT_NOTE_FIELD_ENCRYPTION_INFO = 'PRIVATE_STATE_SELF_MINT_NOTE_FIELD_ENCRYPTION_V1';
const ENCRYPTED_NOTE_SCHEME_SELF_MINT = 1;

export type PrivateStateMintConfig = ChannelStateConfig & {
  network: 'mainnet' | 'sepolia' | 'anvil';
  channelId?: number;
  txNonce: number;
  calldata: `0x${string}`;
  senderIndex: number;
  noteOwnerIndex: number;
  outputCount: 1 | 2 | 3 | 4 | 5 | 6;
  noteValues: [`0x${string}`, ...`0x${string}`[]];
  noteSalts: [`0x${string}`, ...`0x${string}`[]];
  function: ChannelFunctionConfig;
};

export type ExampleNetwork = PrivateStateMintConfig['network'];

export type DerivedParticipantKeys = {
  privateKeys: Uint8Array[];
  publicKeys: EdwardsPoint[];
};

const MINT_NOTES1_ABI = [
  'function mintNotes1((uint256 value,bytes32[3] encryptedNoteValue)[1] outputs) returns (bytes32[1] commitments)',
];

const MINT_NOTES2_ABI = [
  'function mintNotes2((uint256 value,bytes32[3] encryptedNoteValue)[2] outputs) returns (bytes32[2] commitments)',
];

const MINT_NOTES3_ABI = [
  'function mintNotes3((uint256 value,bytes32[3] encryptedNoteValue)[3] outputs) returns (bytes32[3] commitments)',
];

const MINT_NOTES4_ABI = [
  'function mintNotes4((uint256 value,bytes32[3] encryptedNoteValue)[4] outputs) returns (bytes32[4] commitments)',
];
const MINT_NOTES5_ABI = [
  'function mintNotes5((uint256 value,bytes32[3] encryptedNoteValue)[5] outputs) returns (bytes32[5] commitments)',
];
const MINT_NOTES6_ABI = [
  'function mintNotes6((uint256 value,bytes32[3] encryptedNoteValue)[6] outputs) returns (bytes32[6] commitments)',
];

export const mintInterfaces = {
  1: new ethers.Interface(MINT_NOTES1_ABI),
  2: new ethers.Interface(MINT_NOTES2_ABI),
  3: new ethers.Interface(MINT_NOTES3_ABI),
  4: new ethers.Interface(MINT_NOTES4_ABI),
  5: new ethers.Interface(MINT_NOTES5_ABI),
  6: new ethers.Interface(MINT_NOTES6_ABI),
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

const parseOutputCount = (value: unknown, label: string): 1 | 2 | 3 | 4 | 5 | 6 => {
  const parsed = parseNumberValue(value, label);
  if (parsed !== 1 && parsed !== 2 && parsed !== 3 && parsed !== 4 && parsed !== 5 && parsed !== 6) {
    throw new Error(`${label} must be 1, 2, 3, 4, 5, or 6`);
  }
  return parsed;
};

const normalizeBytes32Hex = (value: ethers.BytesLike): `0x${string}` =>
  ethers.hexlify(ethers.zeroPadValue(ethers.hexlify(value), 32)).toLowerCase() as `0x${string}`;

const networkChainId = (network: ExampleNetwork): bigint => {
  if (network === 'mainnet') {
    return 1n;
  }
  if (network === 'sepolia') {
    return 11155111n;
  }
  return 31337n;
};

const fieldElementHex = (value: bigint): `0x${string}` =>
  normalizeBytes32Hex(ethers.toBeHex(value));

const deriveDeterministicEphemeralScalar = (seed: `0x${string}`): bigint =>
  (BigInt(seed) % (JUBJUB_ORDER - 1n)) + 1n;

const packEncryptedNoteValue = ({
  ephemeralPubKeyX,
  ephemeralPubKeyYParity,
  nonce,
  ciphertextValue,
  tag,
}: {
  ephemeralPubKeyX: `0x${string}`;
  ephemeralPubKeyYParity: number;
  nonce: `0x${string}`;
  ciphertextValue: `0x${string}`;
  tag: `0x${string}`;
}): [`0x${string}`, `0x${string}`, `0x${string}`] => {
  const parity = Number(ephemeralPubKeyYParity);
  if (parity !== 0 && parity !== 1) {
    throw new Error('Encrypted note value y parity must be 0 or 1');
  }
  return [
    normalizeBytes32Hex(ephemeralPubKeyX),
    ethers.hexlify(
      ethers.concat([
        Uint8Array.from([parity]),
        ethers.getBytes(ethers.zeroPadValue(nonce, 12)),
        ethers.getBytes(ethers.zeroPadValue(tag, 16)),
        Uint8Array.from([ENCRYPTED_NOTE_SCHEME_SELF_MINT, 0, 0]),
      ]),
    ).toLowerCase() as `0x${string}`,
    normalizeBytes32Hex(ciphertextValue),
  ];
};

const deriveFieldMask = ({
  sharedSecretPoint,
  chainId,
  channelId,
  owner,
  nonce,
}: {
  sharedSecretPoint: EdwardsPoint;
  chainId: bigint;
  channelId: bigint;
  owner: `0x${string}`;
  nonce: `0x${string}`;
}): bigint => {
  const affine = sharedSecretPoint.toAffine();
  return BigInt(
    bytesToHex(
      poseidon(
        ethers.getBytes(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ['string', 'uint256', 'uint256', 'address', 'uint256', 'uint256', 'bytes12'],
            [
              MINT_NOTE_FIELD_ENCRYPTION_INFO,
              chainId,
              channelId,
              ethers.getAddress(owner),
              affine.x,
              affine.y,
              ethers.zeroPadValue(nonce, 12),
            ],
          ) as `0x${string}`,
        ),
      ),
    ),
  );
};

const deriveCipherTag = ({
  sharedSecretPoint,
  chainId,
  channelId,
  owner,
  nonce,
  ciphertextValue,
}: {
  sharedSecretPoint: EdwardsPoint;
  chainId: bigint;
  channelId: bigint;
  owner: `0x${string}`;
  nonce: `0x${string}`;
  ciphertextValue: bigint;
}): `0x${string}` => {
  const affine = sharedSecretPoint.toAffine();
  return ethers.dataSlice(
    bytesToHex(
      poseidon(
        ethers.getBytes(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ['string', 'uint256', 'uint256', 'address', 'uint256', 'uint256', 'bytes12', 'bytes32'],
            [
              `${MINT_NOTE_FIELD_ENCRYPTION_INFO}:tag`,
              chainId,
              channelId,
              ethers.getAddress(owner),
              affine.x,
              affine.y,
              ethers.zeroPadValue(nonce, 12),
              fieldElementHex(ciphertextValue),
            ],
          ) as `0x${string}`,
        ),
      ),
    ),
    0,
    16,
  ).toLowerCase() as `0x${string}`;
};

const buildDeterministicMintEncryptedNoteValue = ({
  owner,
  ownerPoint,
  value,
  seed,
  network,
  channelId,
}: {
  owner: `0x${string}`;
  ownerPoint: EdwardsPoint;
  value: bigint;
  seed: `0x${string}`;
  network: ExampleNetwork;
  channelId: number;
}): [`0x${string}`, `0x${string}`, `0x${string}`] => {
  const ephemeralPrivateScalar = deriveDeterministicEphemeralScalar(seed);
  const nonce = ethers.dataSlice(seed, 0, 12) as `0x${string}`;
  const ephemeralPoint = jubjub.ExtendedPoint.BASE.multiply(ephemeralPrivateScalar);
  const sharedSecretPoint = ownerPoint.multiply(ephemeralPrivateScalar);
  if (value < 0n || value >= BLS12_381_SCALAR_FIELD_MODULUS) {
    throw new Error('Mint note value must fit within the BLS12-381 scalar field');
  }
  const fieldMask = deriveFieldMask({
    sharedSecretPoint,
    chainId: networkChainId(network),
    channelId: BigInt(channelId),
    owner,
    nonce,
  });
  const ciphertextValue = (value + fieldMask) % BLS12_381_SCALAR_FIELD_MODULUS;
  const tag = deriveCipherTag({
    sharedSecretPoint,
    chainId: networkChainId(network),
    channelId: BigInt(channelId),
    owner,
    nonce,
    ciphertextValue,
  });
  const affine = ephemeralPoint.toAffine();
  return packEncryptedNoteValue({
    ephemeralPubKeyX: fieldElementHex(affine.x),
    ephemeralPubKeyYParity: Number(affine.y & 1n),
    nonce,
    ciphertextValue: fieldElementHex(ciphertextValue),
    tag,
  });
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

  const outputCount = parseOutputCount(configRaw.outputCount, 'outputCount');
  const noteValues = assertStringArray(configRaw.noteValues, 'noteValues').map(
    (entry, index) => parseHexString(entry, `noteValues[${index}]`),
  );
  const noteSalts = assertStringArray(configRaw.noteSalts, 'noteSalts').map(
    (entry, index) => parseHexString(entry, `noteSalts[${index}]`),
  );
  if (noteValues.length !== outputCount) {
    throw new Error(`noteValues must have length ${outputCount}`);
  }
  if (noteSalts.length !== outputCount) {
    throw new Error(`noteSalts must have length ${outputCount}`);
  }

  return {
    network: parseNetwork(configRaw.network, 'network'),
    channelId: configRaw.channelId === undefined
      ? DEFAULT_CHANNEL_ID
      : parseNumberValue(configRaw.channelId, 'channelId'),
    participants,
    storageConfigs: assertStorageConfigs(configRaw.storageConfigs, 'storageConfigs'),
    callCodeAddresses: assertStringArray(configRaw.callCodeAddresses, 'callCodeAddresses').map(
      (entry) => parseHexString(entry, 'callCodeAddresses'),
    ),
    blockNumber: parseNumberValue(configRaw.blockNumber, 'blockNumber'),
    txNonce: parseNumberValue(configRaw.txNonce, 'txNonce'),
    calldata: parseHexString(configRaw.calldata, 'calldata'),
    senderIndex: parseNumberValue(configRaw.senderIndex, 'senderIndex'),
    noteOwnerIndex: parseNumberValue(configRaw.noteOwnerIndex, 'noteOwnerIndex'),
    outputCount,
    noteValues: noteValues as [`0x${string}`, ...`0x${string}`[]],
    noteSalts: noteSalts as [`0x${string}`, ...`0x${string}`[]],
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
    const signature = ethers.hexlify(jubjub.utils.randomPrivateKey(toSeedBytes(participant.prvSeedL2))) as `0x${string}`;
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
): `0x${string}` => {
  assertParticipantIndex(config, config.senderIndex, 'senderIndex', keyMaterial);
  assertParticipantIndex(config, config.noteOwnerIndex, 'noteOwnerIndex', keyMaterial);
  if (config.noteOwnerIndex !== config.senderIndex) {
    throw new Error('mintNotes is self-mint only; noteOwnerIndex must equal senderIndex');
  }

  const noteOwnerAddress = fromEdwardsToAddress(keyMaterial.publicKeys[config.senderIndex]).toString() as `0x${string}`;
  const noteOwnerPoint = keyMaterial.publicKeys[config.senderIndex];
  const mintInterface = mintInterfaces[config.outputCount];
  const functionName = `mintNotes${config.outputCount}` as
    | 'mintNotes1'
    | 'mintNotes2'
    | 'mintNotes3'
    | 'mintNotes4'
    | 'mintNotes5'
    | 'mintNotes6';
  const outputs = config.noteValues.map((value, index) => ({
    value: BigInt(value),
    encryptedNoteValue: buildDeterministicMintEncryptedNoteValue({
      owner: noteOwnerAddress,
      ownerPoint: noteOwnerPoint,
      value: BigInt(value),
      seed: config.noteSalts[index],
      network: config.network,
      channelId: config.channelId ?? DEFAULT_CHANNEL_ID,
    }),
  }));
  const encoded = mintInterface.encodeFunctionData(functionName, [outputs]);
  return encoded as `0x${string}`;
};

export const toStateManagerChannelConfig = (
  config: PrivateStateMintConfig,
): ChannelStateConfig => ({
  network: config.network,
  participants: config.participants,
  storageConfigs: config.storageConfigs,
  callCodeAddresses: config.callCodeAddresses,
  blockNumber: config.blockNumber,
});

export const getExampleRpcUrl = (network: ExampleNetwork, env: NodeJS.ProcessEnv = process.env): string => {
  if (network === 'anvil') {
    const configuredRpcUrl = env[ANVIL_RPC_URL_ENV_KEY]?.trim();
    return configuredRpcUrl && configuredRpcUrl.length > 0 ? configuredRpcUrl : DEFAULT_ANVIL_RPC_URL;
  }

  return getRpcUrlFromEnv(network, env, { envPath: EXAMPLES_ENV_PATH });
};
