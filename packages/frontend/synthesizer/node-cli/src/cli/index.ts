#!/usr/bin/env node

import { program } from 'commander';
import { StateSnapshot, TxSnapshot } from 'tokamak-l2js';
import { synthesizeFromSnapshotInput } from '../../../core/src/app.ts';
import { loadSubcircuitWasm } from '../subcircuit/wasmLoader.ts';
import { readJson } from './utils/node.ts';
import { writeSynthesisOutputJson } from '../io/jsonWriter.ts';
import type { BlockInfo } from '../rpc/types.ts';
import { installedSubcircuitLibrary } from '../subcircuit/installedLibrary.ts';

program.name('synthesizer-cli').description('CLI tool for Tokamak zk-EVM Synthesizer').version('0.9.0');

program
  .command('tokamak-ch-tx')
  .description('Execute TokamakL2JS Channel transaction')
  .requiredOption('--previous-state <path>', 'Path to previous state snapshot JSON')
  .requiredOption('--transaction <path>', 'Path to transaction snapshot JSON file')
  .requiredOption('--block-info <path>', 'Path to block information JSON')
  .requiredOption('--contract-code <path>', 'Path to contract code JSON')
  .action(async options => {
    try {
      console.log('🔄 Executing L2 State Channel Transfer...');
      console.log('');

      const previousState = readJson<StateSnapshot>(options.previousState);
      const previousStateRoots = previousState.stateRoots;
      console.log(`   ✅ Previous state roots: ${previousStateRoots.join(', ')}`);

      const transactionSnapshot = readJson<TxSnapshot>(options.transaction);
      const contractCodesStr =  readJson<{address: string, code: string}[]>(options.contractCode);
      const blockInfo = readJson<BlockInfo>(options.blockInfo);

      console.log('[SynthesizerAdapter] Generating circuit outputs...');
      const output = await synthesizeFromSnapshotInput({
        previousState,
        transaction: transactionSnapshot,
        blockInfo,
        contractCodes: contractCodesStr,
        subcircuitLibrary: installedSubcircuitLibrary,
        wasmBuffers: loadSubcircuitWasm(),
      });

      writeSynthesisOutputJson(output);
      console.log(`[SynthesizerAdapter] ✅ Outputs written`);

    } catch (error: any) {
      console.error('❌ Transfer failed:', error.message);
      process.exit(1);
    }
  });

void program.parseAsync(process.argv);
