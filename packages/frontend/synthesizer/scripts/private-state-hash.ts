import { bytesToHex, hexToBytes } from '@ethereumjs/util';
import { ethers } from 'ethers';
import { poseidon } from '../src/interface/tokamakL2js/index.ts';

export type PrivateStateNoteLike = {
  owner: `0x${string}`;
  value: `0x${string}`;
  salt: `0x${string}`;
};

const coder = ethers.AbiCoder.defaultAbiCoder();

const poseidonHex = (encoded: `0x${string}`): `0x${string}` =>
  bytesToHex(poseidon(hexToBytes(encoded))) as `0x${string}`;

export const computeReplayPrivateStateNoteCommitment = (
  chainId: bigint,
  noteRegistry: `0x${string}`,
  canonicalAsset: `0x${string}`,
  note: PrivateStateNoteLike,
): `0x${string}` =>
  poseidonHex(
    coder.encode(
      ['uint256', 'address', 'address', 'uint256', 'address', 'bytes32'],
      [chainId, noteRegistry, canonicalAsset, BigInt(note.value), note.owner, note.salt],
    ) as `0x${string}`,
  );

export const computeReplayPrivateStateNullifier = (
  chainId: bigint,
  nullifierRegistry: `0x${string}`,
  canonicalAsset: `0x${string}`,
  note: PrivateStateNoteLike,
): `0x${string}` =>
  poseidonHex(
    coder.encode(
      ['uint256', 'address', 'address', 'uint256', 'address', 'bytes32'],
      [chainId, nullifierRegistry, canonicalAsset, BigInt(note.value), note.owner, note.salt],
    ) as `0x${string}`,
  );

export const computeReplayPrivateStateMappingKey = (key: `0x${string}`): `0x${string}` =>
  poseidonHex(coder.encode(['bytes32', 'uint256'], [key, 0n]) as `0x${string}`);
