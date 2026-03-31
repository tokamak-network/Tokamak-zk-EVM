import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { bytesToHex, hexToBytes } from '@ethereumjs/util';
import { ethers } from 'ethers';
import { poseidon } from 'tokamak-l2js';

export type PrivateStateNoteLike = {
  owner: `0x${string}`;
  value: `0x${string}`;
  salt: `0x${string}`;
};

export type SolidityStorageLayout = {
  storage: Array<{
    contract: string;
    label: string;
    offset: number;
    slot: string;
    type: string;
  }>;
  types: Record<
    string,
    {
      encoding: string;
      key?: string;
      label: string;
      numberOfBytes: string;
      value?: string;
    }
  >;
};

export type PrivateStateStorageLayoutManifest = {
  generatedAtUtc: string;
  chainId: number;
  contracts: Record<
    string,
    {
      address: `0x${string}`;
      sourceName: string;
      contractName: string;
      storageLayout: SolidityStorageLayout;
    }
  >;
};

const coder = ethers.AbiCoder.defaultAbiCoder();
const NOTE_COMMITMENT_DOMAIN = ethers.keccak256(ethers.toUtf8Bytes('PRIVATE_STATE_NOTE_COMMITMENT'));
const NULLIFIER_DOMAIN = ethers.keccak256(ethers.toUtf8Bytes('PRIVATE_STATE_NULLIFIER'));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..', '..');
const defaultStorageLayoutPath = path.resolve(
  packageRoot,
  'scripts',
  'deployment',
  'private-state',
  'storage-layout.31337.latest.json',
);

const poseidonHex = (encoded: `0x${string}`): `0x${string}` =>
  bytesToHex(poseidon(hexToBytes(encoded))) as `0x${string}`;

const getLayoutEntry = (
  manifest: PrivateStateStorageLayoutManifest,
  contractName: keyof PrivateStateStorageLayoutManifest['contracts'] | string,
  label: string,
) => {
  const contract = manifest.contracts[contractName];
  if (contract === undefined) {
    throw new Error(`Unknown private-state storage-layout contract: ${String(contractName)}`);
  }
  const entry = contract.storageLayout.storage.find((candidate) => candidate.label === label);
  if (entry === undefined) {
    throw new Error(`Missing storage-layout entry ${String(contractName)}.${label}`);
  }
  return entry;
};

export const deriveReplayPrivateStateFieldValue = (label: string): `0x${string}` =>
  bytesToHex(poseidon(ethers.toUtf8Bytes(label))) as `0x${string}`;

export const computeReplayPrivateStateNoteCommitment = (note: PrivateStateNoteLike): `0x${string}` =>
  poseidonHex(
    coder.encode(
      ['bytes32', 'address', 'uint256', 'bytes32'],
      [NOTE_COMMITMENT_DOMAIN, note.owner, BigInt(note.value), note.salt],
    ) as `0x${string}`,
  );

export const computeReplayPrivateStateNullifier = (note: PrivateStateNoteLike): `0x${string}` =>
  poseidonHex(
    coder.encode(
      ['bytes32', 'address', 'uint256', 'bytes32'],
      [NULLIFIER_DOMAIN, note.owner, BigInt(note.value), note.salt],
    ) as `0x${string}`,
  );

export const computeReplayPrivateStateMappingKey = (
  key: `0x${string}`,
  slot: bigint | number,
): `0x${string}` => poseidonHex(coder.encode(['bytes32', 'uint256'], [key, BigInt(slot)]) as `0x${string}`);

export const computeReplayPrivateStateAddressMappingKey = (
  account: `0x${string}`,
  slot: bigint | number,
): `0x${string}` => poseidonHex(coder.encode(['address', 'uint256'], [account, BigInt(slot)]) as `0x${string}`);

export const computeReplayPrivateStateEncryptedNoteSalt = (
  encryptedNoteValue: [`0x${string}`, `0x${string}`, `0x${string}`],
): `0x${string}` =>
  poseidonHex(coder.encode(['bytes32[3]'], [encryptedNoteValue]) as `0x${string}`);

export const loadPrivateStateStorageLayoutManifest = async (
  manifestPath = defaultStorageLayoutPath,
): Promise<PrivateStateStorageLayoutManifest> => {
  const contents = await fs.readFile(manifestPath, 'utf8');
  return JSON.parse(contents) as PrivateStateStorageLayoutManifest;
};

export const getPrivateStateControllerCommitmentExistsSlot = (
  manifest: PrivateStateStorageLayoutManifest,
): bigint => BigInt(getLayoutEntry(manifest, 'PrivateStateController', 'commitmentExists').slot);

export const getPrivateStateControllerNullifierUsedSlot = (
  manifest: PrivateStateStorageLayoutManifest,
): bigint => BigInt(getLayoutEntry(manifest, 'PrivateStateController', 'nullifierUsed').slot);

export const getPrivateStateVaultLiquidBalancesSlot = (
  manifest: PrivateStateStorageLayoutManifest,
): bigint => BigInt(getLayoutEntry(manifest, 'L2AccountingVault', 'liquidBalances').slot);
