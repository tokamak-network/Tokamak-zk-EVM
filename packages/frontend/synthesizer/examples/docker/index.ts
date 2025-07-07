/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx index.ts <TRANSACTION_HASH> <RPC_URL>
 */

import { Address, hexToBytes } from '@synthesizer-libs/util';
import { ethers } from 'ethers';
import { createEVM } from '../../src/constructors.js';
import { Finalizer } from '../../src/tokamak/core/finalizer/index.js';
import { getBlockHeaderFromRPC } from '../../src/tokamak/utils/index.js';

export const processTransaction = async (rpcUrl: string, txHash: string) => {
  const evm = await createEVM({
    txHash,
    rpcUrl,
  });

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const tx = await provider.getTransaction(txHash);

  if (tx === null || tx.blockNumber === null) {
    throw new Error('Transaction not found or not yet mined');
  }
  if (tx.to === null) {
    throw new Error('Transaction to address is null');
  }
  if (tx.from === null) {
    throw new Error('Transaction from address is null');
  }
  if (tx.data === null) {
    throw new Error('Transaction data is null');
  }

  const { blockNumber, from, to, data, value, gasLimit } = tx;

  const actualTargetBlockHeader = await getBlockHeaderFromRPC(
    rpcUrl,
    blockNumber,
  );

  const evmInput = {
    to: new Address(hexToBytes(to)),
    caller: new Address(hexToBytes(from)),
    data: hexToBytes(data),
    value: BigInt(value),
    gasLimit: BigInt(gasLimit),
    block: {
      header: {
        number: actualTargetBlockHeader.number,
        timestamp: actualTargetBlockHeader.timestamp,
        coinbase: actualTargetBlockHeader.coinbase,
        difficulty: actualTargetBlockHeader.difficulty,
        prevRandao: actualTargetBlockHeader.mixHash,
        gasLimit: actualTargetBlockHeader.gasLimit,
        baseFeePerGas: actualTargetBlockHeader.baseFeePerGas,
        getBlobGasPrice: actualTargetBlockHeader.getBlobGasPrice,
      },
    },
    skipBalance: true,
  };
  // Now run the transfer
  const result = await evm.runCall(evmInput);

  // console.log('result.execResult : ', result.execResult);

  if (result.execResult.runState === undefined) {
    throw new Error('No synthesizer found');
  }

  const finalizer = new Finalizer(result.execResult.runState.synthesizer.state);
  const permutation = await finalizer.exec(undefined, false);

  return { evm, permutation, executionResult: result };
};

const main = async () => {
  const [, , RPC_URL, TRANSACTION_HASH] = process.argv;

  if (!TRANSACTION_HASH || !RPC_URL) {
    console.error('Usage: tsx index.ts <TRANSACTION_HASH> <RPC_URL>');
    process.exit(1);
  }
  const { evm, permutation, executionResult } = await processTransaction(
    RPC_URL,
    TRANSACTION_HASH,
  );
  console.log(`✅ Successfully processed transaction: ${TRANSACTION_HASH}`);

  return { evm, permutation, executionResult };
};

void main().catch((err) => {
  console.error(err);
  console.error(`❌ Failed to process transaction.`);
  process.exit(1);
});
