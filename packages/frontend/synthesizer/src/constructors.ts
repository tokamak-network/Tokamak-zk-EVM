import { Common, Mainnet, Sepolia } from '@synthesizer-libs/common';
import { RPCStateManager } from '@synthesizer-libs/statemanager';

import { NobleBN254 } from './precompiles/index.js';
import { EVMMockBlockchain } from './types.js';

import { EVM } from './index.js';
import { ethers } from 'ethers';

import type { EVMOpts } from './index.js';

/**
 * Use this async static constructor for the initialization
 * of an EVM object
 *
 * @param createOpts The EVM options
 * @returns A new EVM
 */
export async function createEVM(
  createOpts?: EVMOpts & {
    isMainnet?: boolean;
    txHash: string;
    rpcUrl: string;
  },
) {
  const opts = createOpts ?? ({} as EVMOpts);
  const isMainnet = createOpts?.isMainnet ?? false;
  const txHash = createOpts?.txHash;
  const rpcUrl = createOpts?.rpcUrl;

  opts.bn254 = new NobleBN254();

  if (opts.common === undefined) {
    opts.common = new Common({ chain: isMainnet ? Mainnet : Sepolia });
  }

  if (opts.blockchain === undefined) {
    opts.blockchain = new EVMMockBlockchain();
  }

  if (opts.stateManager === undefined && txHash && rpcUrl) {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const tx = await provider.getTransaction(txHash);

    if (!tx) {
      throw new Error(
        `트랜잭션 해시 ${txHash}에 해당하는 트랜잭션을 찾을 수 없습니다.`,
      );
    }
    if (!tx.from) {
      throw new Error(`트랜잭션 ${txHash}의 'from' 주소가 없습니다.`);
    }

    if (tx.blockNumber === null) {
      throw new Error(`트랜잭션 ${txHash}가 아직 블록에 포함되지 않았습니다.`);
    }
    const targetBlockNumber = tx.blockNumber;

    opts.stateManager = new RPCStateManager({
      provider: rpcUrl,
      blockTag: BigInt(targetBlockNumber - 1),
    });
  }

  return new EVM(opts);
}
