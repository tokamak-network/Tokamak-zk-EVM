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
  const isMainnet = createOpts?.isMainnet ?? true;
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
      throw new Error(`Transaction not found for hash: ${txHash}`);
    }
    if (!tx.from) {
      throw new Error(`Transaction ${txHash} has no 'from' address`);
    }

    if (tx.blockNumber === null) {
      throw new Error(`Transaction ${txHash} is not yet included in a block`);
    }
    const targetBlockNumber = tx.blockNumber;

    opts.stateManager = new RPCStateManager({
      provider: rpcUrl,
      blockTag: BigInt(targetBlockNumber - 1),
    });
  }

  return new EVM(opts);
}
