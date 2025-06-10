import { Address, hexToBytes } from '@synthesizer-libs/util';
import { ethers } from 'ethers';
import { createEVM } from '../../src/constructors.js';
import { finalize } from '../../src/tokamak/core/finalize.js';
import { getBlockHeaderFromRPC } from '../../src/tokamak/utils/index.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import appRootPath from 'app-root-path';
import { TRANSACTION_HASHES_BATCH_1 } from './test-cases/index.js';

dotenv.config({
  path: '../../.env',
});

// User: Add your transaction hashes here
const TRANSACTION_HASHES = TRANSACTION_HASHES_BATCH_1;

const RPC_URL = process.env.RPC_URL;

// --- Batch Settings ---
// Adjust these values to avoid RPC rate limiting
// The number of transactions to process in one batch
const BATCH_SIZE = 1;
// The delay in milliseconds between each batch
const DELAY_BETWEEN_BATCHES_MS = 1000; // 1 second

interface TestResult {
  txHash: string;
  methodId?: string;
  prvIn?: number;
  prvOut?: number;
  pubIn?: number;
  pubOut?: number;
  sMax?: number;
  error?: string;
}

const analyzeTransaction = async (txHash: string): Promise<TestResult> => {
  // We log the start of analysis here, but the result will be logged in main after the batch completes.
  console.log(`Analyzing transaction: ${txHash}`);
  const result: TestResult = { txHash };

  // Capture console output
  const capturedLogs: string[] = [];
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  console.log = (...args: any[]) => {
    capturedLogs.push(args.map(String).join(' '));
  };
  console.error = (...args: any[]) => {
    capturedLogs.push(args.map(String).join(' '));
  };

  try {
    if (!RPC_URL) {
      throw new Error('RPC_URL is not set');
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
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

    if (tx.data === '0x') {
      result.methodId = '0x (Transfer)';
    } else {
      result.methodId = tx.data.substring(0, 10);
    }

    const evm = await createEVM({
      txHash,
      rpcUrl: RPC_URL,
    });

    const { blockNumber, from, to, data, value, gasLimit } = tx;

    const actualTargetBlockHeader = await getBlockHeaderFromRPC(
      RPC_URL,
      blockNumber,
    );

    const runCallResult = await evm.runCall({
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
    });

    await finalize(
      runCallResult.execResult.runState!.synthesizer.placements,
      undefined,
      true,
    );
  } catch (e: any) {
    if (e.message !== 'Resolve above errors.') {
      result.error = e.message;
    }
  } finally {
    // Restore console
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  }

  // Parse logs
  for (const log of capturedLogs) {
    let match;
    if (
      (match = log.match(
        /Insufficient private input buffer length.*required length: (\d+)/,
      ))
    ) {
      result.prvIn = parseInt(match[1], 10);
    }
    if (
      (match = log.match(
        /Insufficient private output buffer length.*required length: (\d+)/,
      ))
    ) {
      result.prvOut = parseInt(match[1], 10);
    }
    if (
      (match = log.match(
        /Insufficient public input buffer length.*required length: (\d+)/,
      ))
    ) {
      result.pubIn = parseInt(match[1], 10);
    }
    if (
      (match = log.match(
        /Insufficient public output buffer length.*required length: (\d+)/,
      ))
    ) {
      result.pubOut = parseInt(match[1], 10);
    }
    if (
      (match = log.match(
        /The number of placements exceeds the parameter s_max.*required slots: (\d+)/,
      ))
    ) {
      result.sMax = parseInt(match[1], 10);
    }
  }

  return result;
};

const main = async () => {
  const allResults: TestResult[] = [];
  console.log(
    `Starting analysis of ${TRANSACTION_HASHES.length} transactions...`,
  );
  console.log(
    `Batch size: ${BATCH_SIZE}, Delay between batches: ${DELAY_BETWEEN_BATCHES_MS}ms`,
  );

  for (let i = 0; i < TRANSACTION_HASHES.length; i += BATCH_SIZE) {
    const batch = TRANSACTION_HASHES.slice(i, i + BATCH_SIZE);
    const totalBatches = Math.ceil(TRANSACTION_HASHES.length / BATCH_SIZE);
    console.log(
      `\n--- Processing batch ${
        Math.floor(i / BATCH_SIZE) + 1
      }/${totalBatches} (transactions ${i + 1} to ${i + batch.length}) ---`,
    );

    // Process all transactions in the batch concurrently
    const batchPromises = batch.map((txHash) => analyzeTransaction(txHash));
    const batchResults = await Promise.all(batchPromises);

    for (const result of batchResults) {
      console.log('Analysis result:', result);
      allResults.push(result);
    }

    // If there are more batches to process, wait for the specified delay
    if (i + BATCH_SIZE < TRANSACTION_HASHES.length) {
      console.log(
        `--- Batch finished. Waiting for ${
          DELAY_BETWEEN_BATCHES_MS / 1000
        }s... ---`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS),
      );
    }
  }

  console.log('\nAll transactions analyzed. Writing results to file...');

  // Save results to a file
  const outputPath = path.resolve(
    // NOTE: This path was corrected based on your feedback.
    appRootPath.path,
    'packages',
    'frontend',
    'synthesizer',
    'examples',
    'fullnode',
    'results.json',
  );

  try {
    fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2));
    console.log(`\nSuccessfully wrote results to ${outputPath}`);
  } catch (error) {
    console.error('Failed to write results to file:', error);
  }

  console.log('\n\n--- Summary ---');
  console.table(allResults);
  console.log('Script finished.');
};

void main().catch((error) => {
  console.error('An unexpected error occurred in main:', error);
  process.exit(1);
});
