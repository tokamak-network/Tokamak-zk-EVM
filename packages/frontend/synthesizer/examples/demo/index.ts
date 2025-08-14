/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx tansfer.ts
 */

import { Address, hexToBytes } from '@synthesizer-libs/util';
import { ethers } from 'ethers';
import { createEVM } from '../../src/constructors.js';
import { Finalizer } from '../../src/tokamak/core';
import { getBlockHeaderFromRPC } from '../../src/tokamak/utils/index.js';
import dotenv from 'dotenv';

dotenv.config({
  path: '../../.env',
});

// const TRANSACTION_HASH =
//   '0x2fc67302edd645958b58f22dc77013fac44ff51235f3fc16b64e51f561d701c8';
const RPC_URL = process.env.RPC_URL;

const main = async (QAP_PATH: string, TRANSACTION_HASH: string) => {
  if (!QAP_PATH) throw new Error('QAP_PATH is required');
  if (!TRANSACTION_HASH) throw new Error('TRANSACTION_HASH is required');

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

  const finalizer = new Finalizer(QAP_PATH, result.execResult.runState.synthesizer.state);
  const permutation = await finalizer.exec(undefined, true);
};

void main(process.argv[2], process.argv[3]).catch(console.error);
