import { BlockHeader, HeaderData, createBlockHeader } from "@ethereumjs/block";
import { addHexPrefix, Address, bigIntToBytes, createAddressFromString, hexToBytes, setLengthLeft } from "@ethereumjs/util";
import { ethers, keccak256, solidityPacked } from "ethers";
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

export async function getBlockHeaderFromRPC(
rpcUrl: string,
blockNumber: number,
) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const block: any = await provider.getBlock(blockNumber, false);

  if (!block) {
    throw new Error(`RPC에서 블록 ${blockNumber}를 찾을 수 없습니다.`);
  }

  const mixHash = block.mixHash
    ? hexToBytes(block.mixHash)
    : hexToBytes(
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      );
  const nonce = block.nonce
    ? hexToBytes(block.nonce)
    : hexToBytes('0x0000000000000000');
  const extraData = block.extraData
    ? hexToBytes(block.extraData)
    : hexToBytes('0x');
  const withdrawalsRoot = block.withdrawalsRoot
    ? hexToBytes(block.withdrawalsRoot)
    : undefined;
  const parentBeaconBlockRoot = block.parentBeaconBlockRoot
    ? hexToBytes(block.parentBeaconBlockRoot)
    : undefined;

  return {
    number: BigInt(block.number),
    timestamp: BigInt(block.timestamp),
    baseFeePerGas: BigInt(block.baseFeePerGas || '0x0'),
    gasLimit: BigInt(block.gasLimit),
    difficulty: BigInt(block.difficulty),
    mixHash: mixHash,
    parentHash: hexToBytes(block.parentHash),
    coinbase: createAddressFromString(block.miner!),
    withdrawalsRoot: withdrawalsRoot,
    blobGasUsed:
      block.blobGasUsed != null ? BigInt(block.blobGasUsed) : undefined,
    excessBlobGas:
      block.excessBlobGas != null ? BigInt(block.excessBlobGas) : undefined,
    parentBeaconBlockRoot: parentBeaconBlockRoot,
    getBlobGasPrice: () => BigInt(block.blobGasUsed || 0),
  };
}
