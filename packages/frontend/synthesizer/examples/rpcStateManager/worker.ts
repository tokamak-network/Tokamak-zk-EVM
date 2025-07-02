import { Address, hexToBytes } from '@synthesizer-libs/util';
import { ethers } from 'ethers';
import { createEVM } from '../../src/constructors.js';
import { Finalizer } from '../../src/tokamak/core/index.js';
import { getBlockHeaderFromRPC } from '../../src/tokamak/utils/index.js';
import dotenv from 'dotenv';

dotenv.config({
  path: '../../.env',
});

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

const analyzeTransactionInWorker = async (
  txHash: string,
): Promise<TestResult> => {
  const result: TestResult = { txHash };

  // Capture console output
  const capturedLogs: string[] = [];
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  const divertConsole = () => {
    console.log = (...args: any[]) => {
      capturedLogs.push(args.map(String).join(' '));
    };
    console.error = (...args: any[]) => {
      capturedLogs.push(args.map(String).join(' '));
    };
  };

  const restoreConsole = () => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  };

  divertConsole();

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

    const finalizer = new Finalizer(
      runCallResult.execResult.runState!.synthesizer.state,
    );
    const permutation = await finalizer.exec(undefined, true);
  } catch (e: any) {
    if (e.message !== 'Resolve above errors.') {
      result.error = e.message;
    }
  } finally {
    restoreConsole();
  }

  // Parse logs from captured output
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
  const txHash = process.argv[2];
  if (!txHash) {
    console.error('Transaction hash must be provided as an argument.');
    process.exit(1);
  }

  try {
    const result = await analyzeTransactionInWorker(txHash);
    // Print the result as a JSON string to stdout for the parent process
    console.log(JSON.stringify(result));
  } catch (error: any) {
    // Also print error as a JSON string so the parent can handle it
    const errorResult = {
      txHash: txHash,
      error: error.message,
    };
    console.log(JSON.stringify(errorResult));
    process.exit(1);
  }
};

void main();
