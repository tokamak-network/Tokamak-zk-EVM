import { ethers } from 'ethers';
import { Address, hexToBytes } from '@ethereumjs/util';

export async function getBlockHeaderFromRPC(
  rpcUrl: string,
  blockNumber: number,
) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const block: any = await provider.getBlock(blockNumber, false);

  if (!block) {
    throw new Error(`RPC에서 블록 ${blockNumber}를 찾을 수 없습니다.`);
  }

  console.log('block : ', block);

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
    coinbase: Address.fromString(block.miner!),
    withdrawalsRoot: withdrawalsRoot,
    blobGasUsed:
      block.blobGasUsed != null ? BigInt(block.blobGasUsed) : undefined,
    excessBlobGas:
      block.excessBlobGas != null ? BigInt(block.excessBlobGas) : undefined,
    parentBeaconBlockRoot: parentBeaconBlockRoot,
    getBlobGasPrice: () => BigInt(block.blobGasUsed || 0),
  };
}
