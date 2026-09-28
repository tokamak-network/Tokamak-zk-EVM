#!/usr/bin/env node

import path from 'node:path';
import { program } from 'commander';
import { buildMetadata } from '../buildMetadata.ts';
import { runTokamakChannelTxFromFiles } from './tokamakChTx.ts';

program
  .name('synthesizer-cli')
  .description('CLI tool for Tokamak zk-EVM Synthesizer')
  .version(buildMetadata.packageVersion);

program
  .command('tokamak-ch-tx')
  .description('Execute TokamakL2JS Channel transaction')
  .requiredOption('--previous-state <path>', 'Path to previous state snapshot JSON')
  .requiredOption('--transaction <path>', 'Path to transaction snapshot JSON file')
  .requiredOption('--block-info <path>', 'Path to block information JSON')
  .requiredOption('--contract-code <path>', 'Path to contract code JSON')
  .option('--output-supplement', 'Write supplementary output artifacts')
  .action(async options => {
    try {
      await runTokamakChannelTxFromFiles({
        previousState: options.previousState,
        transaction: options.transaction,
        blockInfo: options.blockInfo,
        contractCode: options.contractCode,
      }, path.resolve(process.cwd(), 'outputs'), {
        outputSupplement: options.outputSupplement === true,
      });
    } catch (error: any) {
      console.error('❌ Transfer failed:', error.message);
      process.exit(1);
    }
  });

void program.parseAsync(process.argv);
