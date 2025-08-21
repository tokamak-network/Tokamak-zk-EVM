import { BlockHeader, HeaderData, createBlockHeader } from "@ethereumjs/block";
import { addHexPrefix, Address, bigIntToBytes, createAddressFromString, hexToBytes, setLengthLeft } from "@ethereumjs/util";
import { getBlockHeaderFromRPC } from "../../synthesizer/src/tokamak/utils/provider";
import { keccak256, solidityPacked } from "ethers";
import { poseidon2 } from "poseidon-bls12381";

export const L2hash = (a: bigint, b: bigint): bigint => poseidon2([a, b])

export async function fetchBlockHeaderFromRPC(blockNumber: number, rpcUrl: string): Promise<HeaderData> {
  return await getBlockHeaderFromRPC(rpcUrl, blockNumber)
}

export function getStorageKey(parts: Array<Address | number | bigint | string>): Uint8Array {
    const bytesArray: Uint8Array[] = [];
  
    for (const p of parts) {
      let b: Uint8Array;
  
      if (p instanceof Address) {
        b = p.toBytes();
      } else if (typeof p === 'number') {
        b = bigIntToBytes(BigInt(p));
      } else if (typeof p === 'bigint') {
        b = bigIntToBytes(p);
      } else if (typeof p === 'string') {
        b = hexToBytes(addHexPrefix(p));
      } else {
        throw new Error('getStorageKey accepts only Address | number | bigint | string');
      }
  
      bytesArray.push(setLengthLeft(b, 32));
    }
  
    const packed = solidityPacked(Array(parts.length).fill('bytes'), bytesArray);
    const keyHex = keccak256(packed);          // 0x-prefixed string
    return hexToBytes(addHexPrefix(keyHex));
  }