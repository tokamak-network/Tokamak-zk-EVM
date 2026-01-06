#!/usr/bin/env node

import { program } from 'commander';
import { SynthesizerAdapter } from '../adapters/synthesizerAdapter.js';

// load environment variables
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// tr to load .env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Default RPC URLs
const DEFAULT_RPC_URLS = {
  mainnet: '', // Mainnet requires API key, set via env or --rpc flag
  sepolia: 'https://rpc.ankr.com/eth_sepolia',
};

program.name('synthesizer-cli').description('CLI tool for Tokamak zk-EVM Synthesizer').version('0.9.0');

program
  .command('tokamak-ch-tx')
  .description('Execute L2 State Channel transfer')
  .requiredOption('--channel-id <id>', 'Channel ID', parseInt)
  .requiredOption('--init-tx <hash>', 'Initialize transaction hash')
  .option('--sender-key <key>', 'Sender L2 private key (hex) - OR use --signature')
  .option('--signature <sig>', 'MetaMask signature to derive L2 private key - OR use --sender-key')
  .requiredOption('--recipient <address>', 'Recipient L2 address')
  .requiredOption('--amount <amount>', 'Transfer amount in ether (e.g., "1" for 1 TON)')
  .option('--previous-state <path>', 'Path to previous state_snapshot.json')
  .option('--output <dir>', 'Output directory for results')
  .option('--bridge <address>', 'RollupBridge contract address')
  .option('-r, --rpc-url <url>', 'RPC URL for blockchain data')
  .option('-s, --sepolia', 'Use sepolia testnet (default: mainnet)')
  .action(async options => {
    try {
      // Validate: either --sender-key or --signature must be provided
      if (!options.senderKey && !options.signature) {
        console.error('❌ Error: Either --sender-key or --signature must be provided');
        console.error('   Use --sender-key <hex> for direct L2 private key');
        console.error('   Use --signature <hex> for MetaMask signature (L2 key will be derived)');
        process.exit(1);
      }

      const network = options.sepolia ? 'sepolia' : 'mainnet';
      let rpcUrl = options.rpcUrl;

      if (!rpcUrl) {
        if (network === 'mainnet') {
          rpcUrl = process.env.RPC_URL;
          if (!rpcUrl) {
            console.error('Error: No RPC URL configured for mainnet');
            process.exit(1);
          }
        } else {
          rpcUrl = DEFAULT_RPC_URLS[network];
        }
      }

      console.log('🔄 Executing L2 State Channel Transfer...');
      console.log(`   Channel ID: ${options.channelId}`);
      console.log(`   Init TX: ${options.initTx}`);
      console.log(`   Recipient: ${options.recipient}`);
      console.log(`   Amount: ${options.amount} TON`);
      if (options.signature) {
        console.log(`   Auth Method: Signature-based (L2 key will be derived)`);
      } else {
        console.log(`   Auth Method: Direct L2 private key`);
      }
      console.log('');

      const adapter = new SynthesizerAdapter({ rpcUrl });

      // Prepare sender authentication params
      let senderL2PrvKey: Uint8Array | undefined;
      let senderSignature: `0x${string}` | undefined;

      if (options.senderKey) {
        // Convert sender key from hex string to Uint8Array
        const senderKeyHex = options.senderKey.startsWith('0x')
          ? options.senderKey.slice(2)
          : options.senderKey;
        senderL2PrvKey = new Uint8Array(Buffer.from(senderKeyHex, 'hex'));
      } else if (options.signature) {
        // Use signature directly (adapter will derive L2 private key)
        senderSignature = options.signature.startsWith('0x')
          ? options.signature as `0x${string}`
          : `0x${options.signature}` as `0x${string}`;
      }

      const result = await adapter.synthesizeL2Transfer({
        channelId: options.channelId,
        initializeTxHash: options.initTx,
        senderL2PrvKey,
        senderSignature,
        recipientL2Address: options.recipient,
        amount: options.amount,
        previousStatePath: options.previousState,
        outputPath: options.output,
        rollupBridgeAddress: options.bridge, // Will use default from constants if undefined
        rpcUrl,
      });

      if (result.success) {
        console.log('✅ Transfer completed successfully!');
        console.log(`   Previous State Root: ${result.previousStateRoot}`);
        console.log(`   New State Root:      ${result.newStateRoot}`);
        console.log(`   State Snapshot:      ${result.stateSnapshotPath}`);
        process.exit(0);
      } else {
        console.error('❌ Transfer failed:', result.error);
        process.exit(1);
      }
    } catch (error: any) {
      console.error('❌ Transfer failed:', error.message);
      process.exit(1);
    }
  });

program
  .command('get-balances')
  .description('Get participant balances from state snapshot or on-chain deposits')
  .option('--snapshot <path>', 'Path to state_snapshot.json (if omitted, fetches initial deposits from on-chain)')
  .requiredOption('--channel-id <id>', 'Channel ID', parseInt)
  .option('--bridge <address>', 'RollupBridge contract address')
  .option('-r, --rpc-url <url>', 'RPC URL for blockchain data')
  .option('-s, --sepolia', 'Use sepolia testnet (default: mainnet)')
  .action(async options => {
    try {
      const network = options.sepolia ? 'sepolia' : 'mainnet';
      let rpcUrl = options.rpcUrl;

      if (!rpcUrl) {
        if (network === 'mainnet') {
          rpcUrl = process.env.RPC_URL;
          if (!rpcUrl) {
            console.error('Error: No RPC URL configured for mainnet');
            process.exit(1);
          }
        } else {
          rpcUrl = DEFAULT_RPC_URLS[network];
        }
      }

      const source = options.snapshot ? 'state snapshot' : 'on-chain deposits';
      console.log(`📊 Fetching participant balances from ${source}...\n`);

      const adapter = new SynthesizerAdapter({ rpcUrl });

      const result = await adapter.getParticipantBalances({
        stateSnapshotPath: options.snapshot,
        channelId: options.channelId,
        rollupBridgeAddress: options.bridge,
        rpcUrl,
      });

      console.log(`State Root: ${result.stateRoot}`);
      console.log(`Source: ${source}\n`);
      console.log('Participants:');
      result.participants.forEach((participant, idx) => {
        console.log(`  ${idx + 1}. ${participant.l1Address}`);
        console.log(`     L2 MPT Key: ${participant.l2MptKey}`);
        console.log(`     Balance:    ${participant.balanceInEther} TON`);
        console.log('');
      });

      process.exit(0);
    } catch (error: any) {
      console.error('❌ Failed to get balances:', error.message);
      process.exit(1);
    }
  });

program
  .command('info')
  .description('Show synthesizer information')
  .action(() => {
    console.log('🔧 Tokamak zk-EVM Synthesizer');
    console.log('Version: 0.0.10');
    console.log('Description: Interprets Ethereum transactions as combinations of library subcircuits');
    console.log('\nSupported operations:');
    console.log('- EVM opcode synthesis');
    console.log('- Circuit placement management');
    console.log('- Permutation generation');
    console.log('- Zero-knowledge proof preparation');
    console.log('- L2 State Channel transaction synthesis');
    console.log('\nDefault RPC URLs:');
    console.log(`- Mainnet: ${DEFAULT_RPC_URLS.mainnet}`);
    console.log(`- Sepolia: ${DEFAULT_RPC_URLS.sepolia}`);
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
