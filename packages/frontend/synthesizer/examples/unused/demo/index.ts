/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx tansfer.ts
 */
import { Address, hexToBytes } from '@synthesizer-libs/util';
import { ethers } from 'ethers';
import { createEVM } from '../../src/constructors.js';
import { Finalizer } from '../../../src/core/index.js';
import { getBlockHeaderFromRPC } from '../../src/tokamak/utils/index.js';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env'); // resolve using terminal CWD
dotenv.config({
  path: envPath,
  override: true,
});

const RPC_URL = process.env.RPC_URL;

const main = async (TRANSACTION_HASH: string): Promise<void> => {
  if (!RPC_URL) {
    throw new Error('RPC_URL is not set');
  }
  const evm = await createEVM({
    txHash: TRANSACTION_HASH,
    rpcUrl: RPC_URL,
  });
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const tx = await provider.getTransaction(TRANSACTION_HASH);
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
    RPC_URL,
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
  const permutation = await finalizer.exec(undefined, true);
};

(async () => {
  const tx = process.argv[2]
  if (!tx) {
    console.error('Usage: tsx packages/frontend/synthesizer/examples/demo/index.ts <TRANSACTION_HASH>')
    process.exit(1)
  }
  await main(tx)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})