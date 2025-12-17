#!/usr/bin/env node

/**
 * Tokamak ZK-EVM Synthesizer CLI
 * Uses L2 State Channel approach for transaction synthesis
 */

import { Command } from 'commander';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from synthesizer root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const program = new Command();

program.name('synthesizer').description('Tokamak ZK-EVM Synthesizer CLI - L2 State Channel').version('0.0.10');

program
  .command('run')
  .description('Run synthesizer for a given transaction hash')
  .argument('<txHash>', 'Ethereum transaction hash (0x...)')
  .option('-r, --rpc <url>', 'RPC URL for Ethereum node')
  .action(async (txHash: string, options: { rpc?: string }) => {
    try {
      console.log('🚀 Tokamak ZK-EVM Synthesizer (L2 State Channel)');
      console.log('');

      // Normalize tx hash
      if (!txHash.startsWith('0x')) {
        txHash = '0x' + txHash;
      }

      // Get RPC URL
      const rpcUrl = options.rpc || process.env.RPC_URL;
      if (!rpcUrl) {
        console.error('❌ RPC URL not provided');
        console.error('Set RPC_URL in .env or use --rpc flag');
        process.exit(1);
      }

      console.log(`📋 Transaction: ${txHash}`);
      console.log(`🔗 RPC: ${rpcUrl.substring(0, 40)}...`);
      console.log('');

      // Import L2 synthesizer modules dynamically
      const { ethers } = await import('ethers');
      const { jubjub } = await import('@noble/curves/jubjub');
      const { bytesToBigInt, setLengthLeft, utf8ToBytes, hexToBytes, concatBytes } = await import('@ethereumjs/util');
      const { fromEdwardsToAddress } = await import('../TokamakL2JS/index.js');
      const { createSynthesizerOptsForSimulationFromRPC } = await import('../interface/rpc/rpc.js');
      const { createSynthesizer } = await import('../synthesizer/index.js');
      const { createCircuitGenerator } = await import('../circuitGenerator/circuitGenerator.js');

      // Helper: Generate deterministic L2 key pairs
      // First key uses randomPrivateKey (sender), rest use keygen
      // Matches L2TONTransfer/main.ts pattern
      function generateL2KeyPair(index: number) {
        const seedString = `L2_SEED_${index}`;
        const seed = setLengthLeft(utf8ToBytes(seedString), 32);

        if (index === 0) {
          // First key (sender) uses randomPrivateKey like main.ts line 12
          const privateKey = jubjub.utils.randomPrivateKey(seed);
          const publicKey = jubjub.Point.BASE.multiply(bytesToBigInt(privateKey)).toBytes();
          return { privateKey, publicKey };
        } else {
          // Other keys use keygen like main.ts line 19, 54-59
          const { secretKey, publicKey } = jubjub.keygen(seed);
          return { privateKey: secretKey, publicKey };
        }
      }

      console.log('📥 Fetching transaction details...');
      const startTime = Date.now();
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const tx = await provider.getTransaction(txHash);

      if (!tx || !tx.blockNumber) {
        throw new Error(`Transaction ${txHash} not found`);
      }

      console.log(`✅ Found in block ${tx.blockNumber}`);

      if (!tx.to) {
        throw new Error('Transaction must have a recipient (contract) address');
      }

      // Extract EOA addresses only (tx.to is CA, not EOA)
      // addressListL1 should contain at least 2 EOAs: token sender and receiver
      const eoaAddresses = new Set<string>();
      if (tx.from) {
        eoaAddresses.add(tx.from.toLowerCase());
      }

      // Get receiver address from transaction logs
      try {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt && receipt.logs.length > 0) {
          // For ERC20 transfers, parse Transfer event to get receiver
          for (const log of receipt.logs) {
            // Transfer event signature: Transfer(address,address,uint256)
            if (log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
              if (log.topics[2]) {
                const receiver = '0x' + log.topics[2].slice(26); // Remove padding
                eoaAddresses.add(receiver.toLowerCase());
              }
            }
          }
        }
      } catch (error) {
        console.warn('⚠️ Could not fetch transaction receipt, using minimal address list');
      }

      // Ensure we have at least 2 addresses (sender + receiver)
      // Convert Set to Array to ensure no duplicates
      const addressListL1 = Array.from(eoaAddresses);

      // Generate L2 key pairs for state channel
      console.log('🔐 Generating L2 key pairs...');
      const l2KeyPairs = addressListL1.map((_, idx) => generateL2KeyPair(idx));
      const publicKeyListL2 = l2KeyPairs.map(kp => kp.publicKey);
      const senderL2PrvKey = l2KeyPairs[0].privateKey;

      // Build simulation options
      const simulationOpts = {
        txNonce: 0n, // L2 state channel uses fresh nonce starting from 0
        rpcUrl,
        senderL2PrvKey,
        blockNumber: tx.blockNumber - 1, // Use block before tx to get proper sender balance
        contractAddress: tx.to as `0x${string}`, // Contract address (CA)
        userStorageSlots: [0],
        addressListL1: addressListL1 as `0x${string}`[],
        publicKeyListL2,
        callData: hexToBytes(tx.data as `0x${string}`),
      };

      console.log('⚙️  Creating synthesizer...');
      const synthesizerOpts = await createSynthesizerOptsForSimulationFromRPC(simulationOpts);
      const synthesizer = await createSynthesizer(synthesizerOpts);

      console.log('🔄 Synthesizing transaction...');
      const runTxResult = await synthesizer.synthesizeTX();

      console.log('📝 Generating circuit outputs...');
      const circuitGenerator = await createCircuitGenerator(synthesizer);
      circuitGenerator.writeOutputs('examples/outputs');

      const endTime = Date.now();
      console.log('');
      console.log('✅ Synthesis completed!');
      console.log('');
      console.log('📊 Results:');
      console.log(`   Time: ${endTime - startTime}ms`);
      console.log(`   Gas: ${runTxResult.totalGasSpent}`);
      console.log(`   Success: ${!runTxResult.execResult.exceptionError}`);
      console.log(`   L2 Addresses: ${addressListL1.length}`);

      if (runTxResult.execResult.logs) {
        console.log(`   Logs: ${runTxResult.execResult.logs.length}`);
      }

      console.log('');
      console.log('📁 Outputs: examples/outputs/');

      process.exit(0);
    } catch (error) {
      console.error('');
      console.error('❌ Synthesis failed:', error instanceof Error ? error.message : error);
      console.error('');
      console.error('💡 Troubleshooting:');
      console.error('   - Check transaction hash is valid');
      console.error('   - Verify RPC URL is accessible');
      console.error('   - Ensure transaction exists on network');
      process.exit(1);
    }
  });

program
  .command('info')
  .description('Show synthesizer information')
  .action(() => {
    console.log('🔧 Tokamak zk-EVM Synthesizer');
    console.log('Version: 0.0.10');
    console.log('Mode: L2 State Channel');
    console.log('');
    console.log('Commands:');
    console.log('  run <txHash>  - Synthesize a transaction');
    console.log('  info          - Show this information');
  });

// Parse arguments
program.parse();
