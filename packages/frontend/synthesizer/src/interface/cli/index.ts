#!/usr/bin/env node

import { program } from 'commander';
import path from 'path';
import fs from 'fs';
import { createTokamakL2StateManagerFromStateSnapshot, createTokamakL2TxFromRLP, getEddsaPublicKey, poseidon, StateSnapshot, TokamakL2StateManagerOpts, TokamakL2Tx } from 'tokamak-l2js';
import { Common, CommonOpts, Mainnet } from '@ethereumjs/common';
import { SynthesizerOpts } from 'src/synthesizer/types/synthesizer.ts';
import { createSynthesizer } from 'src/synthesizer/constructors.ts';
import { RunTxResult } from '@ethereumjs/vm';
import { loadSubcircuitWasm } from '../node/wasmLoader.ts';
import { createCircuitGenerator } from 'src/circuitGenerator/circuitGenerator.ts';
import { Permutation, PublicInstance } from 'src/circuitGenerator/types/types.ts';
import { PlacementVariables } from 'src/synthesizer/types/placements.ts';
import { addHexPrefix, createAddressFromString, hexToBytes } from '@ethereumjs/util';
import { readJson, writeSnapshotJson } from './utils/node.ts';
import { writeCircuitJson } from '../node/jsonWriter.ts';
import { SynthesizerBlockInfo } from '../rpc/index.ts';

program.name('synthesizer-cli').description('CLI tool for Tokamak zk-EVM Synthesizer').version('0.9.0');

program
  .command('tokamak-ch-tx')
  .description('Execute TokamakL2JS Channel transaction')
  .requiredOption('--previous-state <path>', 'Path to previous state snapshot')
  .requiredOption('--transaction <rlp>', 'RLP string of transaction')
  .requiredOption('--block-info <path>', 'Path to block information')
  .requiredOption('--contract-code <path>', 'Path to contract code')
  .action(async options => {
    try {
      console.log('🔄 Executing L2 State Channel Transfer...');
      console.log('');

      const commonOpts: CommonOpts = {
          chain: {
            // Note: Fix this to Mainnet even if the channel is managed on Sepolia
              ...Mainnet,
          },
          customCrypto: { keccak256: poseidon, ecrecover: getEddsaPublicKey }
      }
      const common = new Common(commonOpts);

      const previousState = readJson<StateSnapshot>(options.previousState);
      const previousStateRoots = previousState.stateRoots;
      console.log(`   ✅ Previous state roots: ${previousStateRoots.join(', ')}`);

      const transactionRlpStr = options.transaction;
      const transaction = createTokamakL2TxFromRLP(hexToBytes(addHexPrefix(transactionRlpStr)), { common });

      const contractCodesStr =  readJson<{address: string, code: string}[]>(options.contractCode);
      const entryContractAddress = createAddressFromString(previousState.entryContractAddress);
      if (!entryContractAddress.equals(transaction.to)) {
        throw new Error(`Transaction target (${transaction.to.toString()}) does not match snapshot entryContractAddress (${entryContractAddress.toString()}).`);
      }
      const stateManagerOpts: TokamakL2StateManagerOpts = {
        common,
        entryContractAddress,
        contractCodes: contractCodesStr.map(entry => ({
          address: createAddressFromString(entry.address),
          code: addHexPrefix(entry.code),
        })),
        storageAddresses: previousState.storageAddresses.map(addrStr => createAddressFromString(addrStr)),
      }
      const stateManager = await createTokamakL2StateManagerFromStateSnapshot(previousState, stateManagerOpts);

      const blockInfo = readJson<SynthesizerBlockInfo>(options.blockInfo);

      const synthesizerOpts: SynthesizerOpts = {
        stateManager,
        blockInfo,
        signedTransaction: transaction,
      }

      console.log('[SynthesizerAdapter] Creating synthesizer with restored state...');
      const synthesizer = await createSynthesizer(synthesizerOpts);

      console.log('[SynthesizerAdapter] Executing transaction...');
      let runTxResult: RunTxResult;
      try {
        runTxResult = await synthesizer.synthesizeTX();
      } catch (error: any) {
        console.error('\n❌ [SynthesizerAdapter] CRITICAL ERROR: Synthesizer execution failed!');
        console.error(`   Error: ${error.message || error}`);
        if (error.stack) {
          const stackLines = error.stack.split('\n').slice(0, 10);
          console.error(`   Stack trace:\n${stackLines.join('\n')}`);
        }
        throw new Error(`Synthesizer execution failed: ${error.message || error}`);
      }
  
      console.log('[SynthesizerAdapter] Generating circuit outputs...');
      const wasmBuffers = loadSubcircuitWasm();
      const circuitGenerator = await createCircuitGenerator(synthesizer, wasmBuffers);
  
      // Get the data before writing (if we need in-memory access)
      const placementVariables: PlacementVariables = circuitGenerator.variableGenerator.placementVariables!;
      const a_pub: PublicInstance = circuitGenerator.variableGenerator.publicInstance!;
      const permutation: Permutation = circuitGenerator.permutationGenerator?.permutation!;

      if (placementVariables === undefined || a_pub === undefined || permutation === undefined ) {
        throw new Error('[SynthesizerAdapter] CircuitGenerator falls into failure.')
      }
      
      // Export final state
      const finalState = await stateManager.captureStateSnapshot(previousState);
      console.log(`[SynthesizerAdapter] ✅ Final state exported with roots: ${finalState.stateRoots.join(', ')}`);
      
      writeCircuitJson(circuitGenerator);
      // Also save state_snapshot.json
      writeSnapshotJson(finalState);
      console.log(`[SynthesizerAdapter] ✅ Outputs written`);

    } catch (error: any) {
      console.error('❌ Transfer failed:', error.message);
      process.exit(1);
    }
  });

// Check if this file is being run directly (works for both CommonJS and ES modules)
const isMainModule = (() => {
  try {
    // ES modules
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    // CommonJS
    return require.main === module;
  }
})();

if (isMainModule) {
  program.parse();
}
