import { Address, hexToBytes } from '@synthesizer-libs/util';
import { ethers } from 'ethers';
import { createEVM } from '../../src/constructors.js';
import { finalize } from '../../src/tokamak/core/finalize.js';
import { getBlockHeaderFromRPC } from '../../src/tokamak/utils/index.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import appRootPath from 'app-root-path';

dotenv.config({
  path: '../../.env',
});

// User: Add your transaction hashes here
const TRANSACTION_HASHES = [
  '0x80eb2fa4852833833f9ae086688431ffebc9ea3cc891ab7df848cfb3fa8cb5be',
  // Add more transaction hashes here
];

const RPC_URL = process.env.RPC_URL;

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
  for (const txHash of TRANSACTION_HASHES) {
    const result = await analyzeTransaction(txHash);
    allResults.push(result);
    console.log('Analysis result:', result);
  }

  console.log('\nLoop finished. Preparing to write results to file...');

  // Save results to a file
  const outputPath = path.resolve(
    appRootPath.path,
    'examples',
    'fullnode',
    'results.json',
  );

  console.log(`Output path resolved to: ${outputPath}`);

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
