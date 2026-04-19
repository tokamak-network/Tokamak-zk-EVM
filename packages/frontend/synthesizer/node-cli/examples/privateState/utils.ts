import { promises as fs } from 'fs';
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
export const DEFAULT_EXAMPLE_NOTE_RECEIVE_CHANNEL_NAME = 'private-state-example-channel';
const DEFAULT_CHANNEL_ID = 4;
const BLS12_381_SCALAR_FIELD_MODULUS =
  BigInt('0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001');
const JUBJUB_ORDER = jubjub.CURVE.n;
const JUBJUB_FP = jubjub.CURVE.Fp;
const JUBJUB_A = jubjub.CURVE.a;
const JUBJUB_D = jubjub.CURVE.d;
const NOTE_RECEIVE_TYPED_DATA_DOMAIN = {
  name: 'TokamakPrivateState',
  version: '1',
};
const NOTE_RECEIVE_TYPED_DATA_TYPES = {
  NoteReceiveKey: [
    { name: 'protocol', type: 'string' },
    { name: 'dapp', type: 'string' },
    { name: 'channelId', type: 'uint256' },
    { name: 'channelName', type: 'string' },
    { name: 'account', type: 'address' },
  ],
};
const NOTE_RECEIVE_TYPED_DATA_PROTOCOL = 'PRIVATE_STATE_NOTE_RECEIVE_KEY_V2';
const NOTE_RECEIVE_TYPED_DATA_DAPP = 'private-state';
const MINT_NOTE_FIELD_ENCRYPTION_INFO = 'PRIVATE_STATE_SELF_MINT_NOTE_FIELD_ENCRYPTION_V1';
const ENCRYPTED_NOTE_SCHEME_SELF_MINT = 1;

export type NoteReceivePubKey = {
  x: `0x${string}`;
  yParity: number;
};

export type MintExampleParticipant = ChannelParticipantConfig & {
  noteReceivePubKeyX: `0x${string}`;
  noteReceivePubKeyYParity: number;
};

export type PrivateStateMintConfig = Omit<ChannelStateConfig, 'participants'> & {
  network: 'mainnet' | 'sepolia' | 'anvil';
  participants: MintExampleParticipant[];
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

const noteReceivePubKeyFromPoint = (point: EdwardsPoint): NoteReceivePubKey => {
  const affine = point.toAffine();
  return {
    x: normalizeBytes32Hex(ethers.toBeHex(affine.x)),
    yParity: Number(affine.y & 1n),
  };
};

const pointFromNoteReceivePubKey = (noteReceivePubKey: NoteReceivePubKey): EdwardsPoint => {
  const x = ethers.toBigInt(noteReceivePubKey.x);
  if (x >= JUBJUB_FP.ORDER) {
    throw new Error('Jubjub note-receive public key x-coordinate is out of range');
  }
  const xSquared = JUBJUB_FP.mul(x, x);
  const numerator = JUBJUB_FP.sub(1n, JUBJUB_FP.mul(JUBJUB_A, xSquared));
  const denominator = JUBJUB_FP.sub(1n, JUBJUB_FP.mul(JUBJUB_D, xSquared));
  let y = JUBJUB_FP.sqrt(JUBJUB_FP.div(numerator, denominator));
  if (Number(y & 1n) !== Number(noteReceivePubKey.yParity)) {
    y = JUBJUB_FP.neg(y);
  }
  return jubjub.ExtendedPoint.fromAffine({ x, y });
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

const normalizeNoteReceivePubKey = (noteReceivePubKey: NoteReceivePubKey): NoteReceivePubKey => ({
  x: normalizeBytes32Hex(noteReceivePubKey.x),
  yParity: Number(noteReceivePubKey.yParity),
});

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

const buildNoteReceiveTypedData = ({
  chainId,
  channelId,
  channelName,
  account,
}: {
  chainId: bigint | number;
  channelId: bigint | number;
  channelName: string;
  account: `0x${string}`;
}) => ({
  domain: {
    ...NOTE_RECEIVE_TYPED_DATA_DOMAIN,
    chainId: Number(chainId),
  },
  types: NOTE_RECEIVE_TYPED_DATA_TYPES,
  value: {
    protocol: NOTE_RECEIVE_TYPED_DATA_PROTOCOL,
    dapp: NOTE_RECEIVE_TYPED_DATA_DAPP,
    channelId: BigInt(channelId).toString(),
    channelName,
    account: ethers.getAddress(account),
  },
});

export const deriveNoteReceiveKeyMaterial = async ({
  signer,
  chainId,
  channelId,
  channelName,
  account,
}: {
  signer: {
    signTypedData(
      domain: Record<string, unknown>,
      types: Record<string, Array<{ name: string; type: string }>>,
      value: Record<string, unknown>,
    ): Promise<string>;
  };
  chainId: bigint | number;
  channelId: bigint | number;
  channelName: string;
  account: `0x${string}`;
}) => {
  const typedData = buildNoteReceiveTypedData({
    chainId,
    channelId,
    channelName,
    account,
  });
  const signature = await signer.signTypedData(typedData.domain, typedData.types, typedData.value);
  const derivedKeys = deriveL2KeysFromSignature(signature as `0x${string}`);
  const privateKey = ethers.hexlify(derivedKeys.privateKey) as `0x${string}`;
  const noteReceivePoint = jubjub.ExtendedPoint.fromHex(derivedKeys.publicKey);
  return {
    typedData,
    signature,
    privateKey,
    noteReceivePubKey: noteReceivePubKeyFromPoint(noteReceivePoint),
  };
};

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
  ownerNoteReceivePubKey,
  value,
  seed,
  network,
  channelId,
}: {
  owner: `0x${string}`;
  ownerNoteReceivePubKey: NoteReceivePubKey;
  value: bigint;
  seed: `0x${string}`;
  network: ExampleNetwork;
  channelId: number;
}): [`0x${string}`, `0x${string}`, `0x${string}`] => {
  const ephemeralPrivateScalar = deriveDeterministicEphemeralScalar(seed);
  const nonce = ethers.dataSlice(seed, 0, 12) as `0x${string}`;
  const ephemeralPoint = jubjub.ExtendedPoint.BASE.multiply(ephemeralPrivateScalar);
  const sharedSecretPoint = pointFromNoteReceivePubKey(ownerNoteReceivePubKey).multiply(ephemeralPrivateScalar);
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

const parseBaseParticipant = (
  value: unknown,
  label: string,
): ChannelParticipantConfig => {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const addressL1 = record.addressL1;
  const prvSeedL2 = record.prvSeedL2;
  if (typeof addressL1 !== 'string' || !addressL1.startsWith('0x')) {
    throw new Error(`${label}.addressL1 must be a hex string with 0x prefix`);
  }
  if (typeof prvSeedL2 !== 'string') {
    throw new Error(`${label}.prvSeedL2 must be a string`);
  }
  return { addressL1: addressL1 as `0x${string}`, prvSeedL2 };
};

const assertMintParticipantArray = (value: unknown, label: string): MintExampleParticipant[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((entry, index) => {
    const participant = parseBaseParticipant(entry, `${label}[${index}]`);
    const record = entry as Record<string, unknown>;
    const noteReceivePubKeyX = record.noteReceivePubKeyX;
    const noteReceivePubKeyYParity = record.noteReceivePubKeyYParity;
    if (typeof noteReceivePubKeyX !== 'string' || !noteReceivePubKeyX.startsWith('0x')) {
      throw new Error(`${label}[${index}].noteReceivePubKeyX must be a hex string with 0x prefix`);
    }
    if (noteReceivePubKeyYParity !== 0 && noteReceivePubKeyYParity !== 1) {
      throw new Error(`${label}[${index}].noteReceivePubKeyYParity must be 0 or 1`);
    }
    return {
      ...participant,
      noteReceivePubKeyX: normalizeBytes32Hex(noteReceivePubKeyX as `0x${string}`),
      noteReceivePubKeyYParity: Number(noteReceivePubKeyYParity),
    };
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

type ParsedBasePrivateStateConfig = {
  network: ExampleNetwork;
  storageConfigs: ChannelStorageConfig[];
  callCodeAddresses: `0x${string}`[];
  blockNumber: number;
  txNonce: number;
  calldata: `0x${string}`;
  senderIndex: number;
  function: ChannelFunctionConfig;
};

const parseBasePrivateStateConfig = (
  configRaw: Record<string, unknown>,
): ParsedBasePrivateStateConfig => ({
  network: parseNetwork(configRaw.network, 'network'),
  storageConfigs: assertStorageConfigs(configRaw.storageConfigs, 'storageConfigs'),
  callCodeAddresses: assertStringArray(configRaw.callCodeAddresses, 'callCodeAddresses').map(
    (entry) => parseHexString(entry, 'callCodeAddresses'),
  ),
  blockNumber: parseNumberValue(configRaw.blockNumber, 'blockNumber'),
  txNonce: parseNumberValue(configRaw.txNonce, 'txNonce'),
  calldata: parseHexString(configRaw.calldata, 'calldata'),
  senderIndex: parseNumberValue(configRaw.senderIndex, 'senderIndex'),
  function: assertFunctionConfig(configRaw.function, 'function'),
});

const toPrivateStateStateManagerChannelConfig = (
  config: Pick<
    ChannelStateConfig,
    'network' | 'participants' | 'storageConfigs' | 'callCodeAddresses' | 'blockNumber'
  >,
): ChannelStateConfig => ({
  network: config.network,
  participants: config.participants,
  storageConfigs: config.storageConfigs,
  callCodeAddresses: config.callCodeAddresses,
  blockNumber: config.blockNumber,
});

export const loadPrivateStateMintConfig = async (
  configPath: string,
): Promise<PrivateStateMintConfig> => {
  const configRaw = JSON.parse(await fs.readFile(configPath, 'utf8')) as Record<string, unknown>;
  const baseConfig = parseBasePrivateStateConfig(configRaw);

  const participants = assertMintParticipantArray(configRaw.participants, 'participants');
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
    ...baseConfig,
    channelId: configRaw.channelId === undefined
      ? DEFAULT_CHANNEL_ID
      : parseNumberValue(configRaw.channelId, 'channelId'),
    participants,
    noteOwnerIndex: parseNumberValue(configRaw.noteOwnerIndex, 'noteOwnerIndex'),
    outputCount,
    noteValues: noteValues as [`0x${string}`, ...`0x${string}`[]],
    noteSalts: noteSalts as [`0x${string}`, ...`0x${string}`[]],
    function: assertFunctionConfig(configRaw.function, 'function'),
  };
};

const toSeedBytes = (seed: string): Uint8Array =>
  setLengthLeft(utf8ToBytes(seed), 32);

export const derivePrivateStateParticipantKeys = (
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
  const noteOwnerParticipant = config.participants[config.senderIndex];
  if (!noteOwnerParticipant) {
    throw new Error(`Could not resolve note owner participant at index ${config.senderIndex}`);
  }
  const noteOwnerNoteReceivePubKey = normalizeNoteReceivePubKey({
    x: noteOwnerParticipant.noteReceivePubKeyX,
    yParity: noteOwnerParticipant.noteReceivePubKeyYParity,
  });
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
      ownerNoteReceivePubKey: noteOwnerNoteReceivePubKey,
      value: BigInt(value),
      seed: config.noteSalts[index],
      network: config.network,
      channelId: config.channelId ?? DEFAULT_CHANNEL_ID,
    }),
  }));
  const encoded = mintInterface.encodeFunctionData(functionName, [outputs]);
  return encoded as `0x${string}`;
};

export const toPrivateStateMintStateManagerChannelConfig = (
  config: PrivateStateMintConfig,
): ChannelStateConfig => toPrivateStateStateManagerChannelConfig(config);

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

const parseInputCount = (value: unknown, label: string): 1 | 2 | 3 | 4 => {
  const parsed = parseNumberValue(value, label);
  if (parsed !== 1 && parsed !== 2 && parsed !== 3 && parsed !== 4) {
    throw new Error(`${label} must be 1, 2, 3, or 4`);
  }
  return parsed;
};

const assertBaseParticipantArray = (
  value: unknown,
  label: string,
): ChannelParticipantConfig[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((entry, index) => parseBaseParticipant(entry, `${label}[${index}]`));
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

const parseFixedNotes = (
  value: unknown,
  label: string,
  expectedLength: number,
): PrivateStateNote[] => {
  if (!Array.isArray(value) || value.length !== expectedLength) {
    throw new Error(`${label} must be an array of length ${expectedLength}`);
  }
  return value.map((entry, index) => parseNote(entry, `${label}[${index}]`));
};

export const loadPrivateStateRedeemConfig = async (
  configPath: string,
): Promise<PrivateStateRedeemConfig> => {
  const configRaw = JSON.parse(await fs.readFile(configPath, 'utf8')) as Record<string, unknown>;
  const baseConfig = parseBasePrivateStateConfig(configRaw);

  const participants = assertBaseParticipantArray(configRaw.participants, 'participants');
  if (participants.length < 2) {
    throw new Error('participants must include at least two entries');
  }
  const inputCount = parseInputCount(configRaw.inputCount, 'inputCount');

  return {
    ...baseConfig,
    participants,
    receiverIndex: parseNumberValue(configRaw.receiverIndex, 'receiverIndex'),
    inputCount,
    inputNotes: parseFixedNotes(
      configRaw.inputNotes,
      'inputNotes',
      inputCount,
    ) as PrivateStateRedeemConfig['inputNotes'],
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

export const toPrivateStateRedeemStateManagerChannelConfig = (
  config: PrivateStateRedeemConfig,
): ChannelStateConfig => toPrivateStateStateManagerChannelConfig(config);

export type OpaqueEncryptedNoteValue = [`0x${string}`, `0x${string}`, `0x${string}`];

export type PrivateStateTransferOutput = {
  owner: `0x${string}`;
  value: `0x${string}`;
  encryptedNoteValue: OpaqueEncryptedNoteValue;
};

export type PrivateStateTransferConfig = ChannelStateConfig & {
  network: ExampleNetwork;
  txNonce: number;
  calldata: `0x${string}`;
  senderIndex: number;
  functionName: string;
  inputCount: number;
  outputCount: number;
  inputNotes: PrivateStateNote[];
  transferOutputs: PrivateStateTransferOutput[];
  outputNotes: PrivateStateNote[];
  function: ChannelFunctionConfig;
};

export const isSupportedTransferArity = (
  inputCount: number,
  outputCount: number,
) =>
  (outputCount === 1 && inputCount >= 1 && inputCount <= 4)
  || (outputCount === 2 && inputCount >= 1 && inputCount <= 3)
  || (outputCount === 3 && inputCount === 1);

const buildTransferFunctionName = (inputCount: number, outputCount: number) =>
  `transferNotes${inputCount}To${outputCount}`;

const buildTransferAbi = (inputCount: number, outputCount: number) => [
  `function ${buildTransferFunctionName(inputCount, outputCount)}((address owner,uint256 value,bytes32[3] encryptedNoteValue)[${outputCount}] outputs,(address owner,uint256 value,bytes32 salt)[${inputCount}] inputNotes) returns (bytes32[${inputCount}] nullifiers, bytes32[${outputCount}] outputCommitments)`,
];

export const createTransferInterface = (inputCount: number, outputCount: number) =>
  new ethers.Interface(buildTransferAbi(inputCount, outputCount));

const parseTransferFunctionName = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !/^transferNotes[1-8]To[123]$/u.test(value)) {
    throw new Error(`${label} must match transferNotes<N>To<M> with N in [1,8] and M in [1,3]`);
  }
  return value;
};

const parseEncryptedNoteValue = (
  value: unknown,
  label: string,
): OpaqueEncryptedNoteValue => {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`${label} must be an array of three bytes32 words`);
  }
  return value.map((entry, index) =>
    parseHexString(entry, `${label}[${index}]`)) as OpaqueEncryptedNoteValue;
};

const parseTransferOutput = (
  value: unknown,
  label: string,
): PrivateStateTransferOutput => {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  return {
    owner: parseHexString(record.owner, `${label}.owner`) as `0x${string}`,
    value: parseHexString(record.value, `${label}.value`),
    encryptedNoteValue: parseEncryptedNoteValue(
      record.encryptedNoteValue,
      `${label}.encryptedNoteValue`,
    ),
  };
};

const parseFixedTransferOutputs = (
  value: unknown,
  label: string,
  expectedLength: number,
): PrivateStateTransferOutput[] => {
  if (!Array.isArray(value) || value.length !== expectedLength) {
    throw new Error(`${label} must be an array of length ${expectedLength}`);
  }
  return value.map((entry, index) => parseTransferOutput(entry, `${label}[${index}]`));
};

export const loadPrivateStateTransferConfig = async (
  configPath: string,
): Promise<PrivateStateTransferConfig> => {
  const configRaw = JSON.parse(await fs.readFile(configPath, 'utf8')) as Record<string, unknown>;
  const baseConfig = parseBasePrivateStateConfig(configRaw);

  const participants = assertBaseParticipantArray(configRaw.participants, 'participants');
  if (participants.length < 2) {
    throw new Error('participants must include at least two entries');
  }

  const functionName = parseTransferFunctionName(configRaw.functionName, 'functionName');
  const inputCount = parseNumberValue(configRaw.inputCount, 'inputCount');
  const outputCount = parseNumberValue(configRaw.outputCount, 'outputCount');
  if (!isSupportedTransferArity(inputCount, outputCount)) {
    throw new Error('private-state transfer replay only supports N<=4 for To1, N<=3 for To2, and only 1->3 for To3');
  }
  if (functionName !== buildTransferFunctionName(inputCount, outputCount)) {
    throw new Error('functionName must match inputCount and outputCount');
  }
  const inputNotes = parseFixedNotes(
    configRaw.inputNotes,
    'inputNotes',
    inputCount,
  ) as PrivateStateTransferConfig['inputNotes'];
  const transferOutputs = parseFixedTransferOutputs(
    configRaw.transferOutputs,
    'transferOutputs',
    outputCount,
  ) as PrivateStateTransferConfig['transferOutputs'];
  const outputNotes = parseFixedNotes(
    configRaw.outputNotes,
    'outputNotes',
    outputCount,
  ) as PrivateStateTransferConfig['outputNotes'];

  return {
    ...baseConfig,
    participants,
    functionName,
    inputCount,
    outputCount,
    inputNotes,
    transferOutputs,
    outputNotes,
    function: assertFunctionConfig(configRaw.function, 'function'),
  };
};

export const buildPrivateStateTransferCalldata = (
  config: PrivateStateTransferConfig,
  _keyMaterial: DerivedParticipantKeys,
): `0x${string}` =>
  createTransferInterface(config.inputCount, config.outputCount).encodeFunctionData(
    config.functionName,
    [config.transferOutputs, config.inputNotes],
  ) as `0x${string}`;

export const toPrivateStateTransferStateManagerChannelConfig = (
  config: PrivateStateTransferConfig,
): ChannelStateConfig => toPrivateStateStateManagerChannelConfig(config);
