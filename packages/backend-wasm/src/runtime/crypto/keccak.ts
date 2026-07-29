import { keccak_256 } from "@noble/hashes/sha3";

export function keccak256(bytes: Uint8Array): Uint8Array {
  return keccak_256(bytes);
}
