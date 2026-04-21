#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { program } from 'commander';
import { runTokamakChannelTxFromFiles } from './tokamakChTx.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageVersion = JSON.parse(
  fs.readFileSync(path.resolve(here, '..', '..', 'package.json'), 'utf8'),
).version as string;

program
  .name('synthesizer-cli')
  .description('CLI tool for Tokamak zk-EVM Synthesizer')
  .version(packageVersion);

program
  .command('tokamak-ch-tx')
  .description('Execute TokamakL2JS Channel transaction')
  .requiredOption('--previous-state <path>', 'Path to previous state snapshot JSON')
  .requiredOption('--transaction <path>', 'Path to transaction snapshot JSON file')
  .requiredOption('--block-info <path>', 'Path to block information JSON')
  .requiredOption('--contract-code <path>', 'Path to contract code JSON')
  .action(async options => {
    try {
      await runTokamakChannelTxFromFiles({
        previousState: options.previousState,
        transaction: options.transaction,
        blockInfo: options.blockInfo,
        contractCode: options.contractCode,
      });
    } catch (error: any) {
      console.error('❌ Transfer failed:', error.message);
      process.exit(1);
    }
  });

void program.parseAsync(process.argv);
