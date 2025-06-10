/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx tansfer.ts
 */

import { Address, hexToBytes } from '@synthesizer-libs/util';
import { ethers } from 'ethers';
import { createEVM } from '../../src/constructors.js';
import { finalize } from '../../src/tokamak/core/finalize.js';
import { getBlockHeaderFromRPC } from '../../src/tokamak/utils/index.js';
import dotenv from 'dotenv';

dotenv.config({
  path: '../../.env',
});

const TRANSACTION_HASH =
  '0x94cf64e16d26fa4b8b710a110b43e9583d7267ae042be25c43999d245e1041dc';
const RPC_URL = 'https://eth-sepolia.g.alchemy.com/v2/PbqCcGx1oHN7yNaFdUJUYqPEN0QSp23S';

const main = async () => {
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
  }
  // Now run the transfer
  const result = await evm.runCall(evmInput);

  // console.log('result.execResult : ', result.execResult);

  await finalize(
    result.execResult.runState!.synthesizer.placements,
    undefined,
    true,
  );
};

void main().catch(console.error);
