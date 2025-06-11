import { ethers } from 'ethers';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import appRootPath from 'app-root-path';
import {
  TRANSACTION_HASHES_BATCH_1,
  TRANSACTION_HASHES_BATCH_2,
  TRANSACTION_HASHES_BATCH_3,
  TRANSACTION_HASHES_BATCH_4,
  TRANSACTION_HASHES_BATCH_5,
} from './test-cases/index.js';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: '../../.env',
});

// User: Add your transaction hashes here
const TRANSACTION_HASHES = TRANSACTION_HASHES_BATCH_5;

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

const main = async () => {
  if (!RPC_URL) {
    throw new Error('RPC_URL is not set');
  }
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  console.log(
    `Fetching ${TRANSACTION_HASHES.length} transactions to filter...`,
  );
  const txPromises = TRANSACTION_HASHES.map((hash) =>
    provider.getTransaction(hash),
  );
  const txs = (await Promise.all(txPromises)).filter(
    (tx) => tx !== null,
  ) as ethers.TransactionResponse[];

  const nonTransferTxs = txs.filter((tx) => tx.data !== '0x');

  console.log(
    `Filtered out ${
      TRANSACTION_HASHES.length - nonTransferTxs.length
    } transactions (transfers or failed to fetch).`,
  );

  const allResults: TestResult[] = [];
  console.log(`Starting analysis of ${nonTransferTxs.length} transactions...`);
  console.log(
    `Batch size: ${BATCH_SIZE}, Delay between batches: ${DELAY_BETWEEN_BATCHES_MS}ms`,
  );

  for (let i = 0; i < nonTransferTxs.length; i += BATCH_SIZE) {
    const batch = nonTransferTxs.slice(i, i + BATCH_SIZE);
    const totalBatches = Math.ceil(nonTransferTxs.length / BATCH_SIZE);
    console.log(
      `\n--- Processing batch ${
        Math.floor(i / BATCH_SIZE) + 1
      }/${totalBatches} (transactions ${i + 1} to ${i + batch.length}) ---`,
    );

    for (const tx of batch) {
      console.log(`Analyzing transaction: ${tx.hash}`);
      try {
        const workerPath = path.resolve(__dirname, 'worker.ts');
        const command = `tsx ${workerPath} ${tx.hash}`;
        const output = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
        const result = JSON.parse(output);
        console.log('Analysis result:', result);
        allResults.push(result);
      } catch (e: any) {
        console.error(
          `Failed to analyze transaction ${tx.hash}:`,
          e.stderr || e.message,
        );
        allResults.push({
          txHash: tx.hash,
          error: e.stderr || e.message,
        });
      }
    }

    // If there are more batches to process, wait for the specified delay
    if (i + BATCH_SIZE < nonTransferTxs.length) {
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
