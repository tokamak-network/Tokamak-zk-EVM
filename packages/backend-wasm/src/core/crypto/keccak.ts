import { keccak_256 } from "@noble/hashes/sha3";

export type KeccakDigest = Uint8Array;

export function keccak256(bytes: Uint8Array): KeccakDigest {
  return keccak_256(bytes);
}
