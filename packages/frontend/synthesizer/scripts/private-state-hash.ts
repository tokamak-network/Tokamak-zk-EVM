import { bytesToHex, hexToBytes } from '@ethereumjs/util';
import { ethers } from 'ethers';
import { poseidon } from '../src/interface/tokamakL2js/index.ts';

export type PrivateStateNoteLike = {
  owner: `0x${string}`;
  value: `0x${string}`;
  salt: `0x${string}`;
};

const coder = ethers.AbiCoder.defaultAbiCoder();
const NOTE_COMMITMENT_DOMAIN = ethers.keccak256(ethers.toUtf8Bytes('PRIVATE_STATE_NOTE_COMMITMENT'));
const NULLIFIER_DOMAIN = ethers.keccak256(ethers.toUtf8Bytes('PRIVATE_STATE_NULLIFIER'));

const poseidonHex = (encoded: `0x${string}`): `0x${string}` =>
  bytesToHex(poseidon(hexToBytes(encoded))) as `0x${string}`;

const computeSharedReplayPrivateStatePayloadHash = (note: PrivateStateNoteLike): `0x${string}` =>
  poseidonHex(
    coder.encode(['uint256', 'address', 'bytes32'], [BigInt(note.value), note.owner, note.salt]) as `0x${string}`,
  );

export const computeReplayPrivateStateNoteCommitment = (note: PrivateStateNoteLike): `0x${string}` =>
  poseidonHex(
    coder.encode(
      ['bytes32', 'bytes32'],
      [NOTE_COMMITMENT_DOMAIN, computeSharedReplayPrivateStatePayloadHash(note)],
    ) as `0x${string}`,
  );

export const computeReplayPrivateStateNullifier = (note: PrivateStateNoteLike): `0x${string}` =>
  poseidonHex(
    coder.encode(
      ['bytes32', 'bytes32'],
      [NULLIFIER_DOMAIN, computeSharedReplayPrivateStatePayloadHash(note)],
    ) as `0x${string}`,
  );

export const computeReplayPrivateStateMappingKey = (
  key: `0x${string}`,
  slot: bigint | number,
): `0x${string}` => poseidonHex(coder.encode(['bytes32', 'uint256'], [key, BigInt(slot)]) as `0x${string}`);
