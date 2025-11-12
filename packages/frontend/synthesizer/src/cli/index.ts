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

program
  .name('synthesizer')
  .description('Tokamak ZK-EVM Synthesizer CLI - L2 State Channel')
  .version('0.0.10');

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
      const { jubjub } = await import('@noble/curves/misc');
      const {
        bytesToBigInt,
        setLengthLeft,
        utf8ToBytes,
        hexToBytes,
      } = await import('@ethereumjs/util');
      const { fromEdwardsToAddress } = await import('../TokamakL2JS/index.js');
      const {
        createSynthesizerOptsForSimulationFromRPC,
      } = await import('../interface/rpc/rpc.js');
      const { createSynthesizer } = await import('../synthesizer/index.js');
      const { createCircuitGenerator } = await import(
        '../circuitGenerator/circuitGenerator.js'
      );

      // Helper: Generate deterministic L2 key pairs from L1 addresses
      // Uses keccak256 hash to ensure valid scalar range for JubJub curve
      async function generateL2KeyPair(l1Address: string) {
        const { keccak256 } = await import('ethereum-cryptography/keccak');
        const seed = utf8ToBytes(`L2_KEY_${l1Address.toLowerCase()}`);
        const hash = keccak256(seed);
        
        // Ensure the value is in valid range [1, curve.n)
        // Use first 32 bytes of hash as entropy for randomPrivateKey
        const privateKey = jubjub.utils.randomPrivateKey(hash);
        const publicKey = jubjub.Point.BASE.multiply(bytesToBigInt(privateKey)).toBytes();
        return { privateKey, publicKey };
      }

      console.log('📥 Fetching transaction details...');
      const startTime = Date.now();
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const tx = await provider.getTransaction(txHash);

      if (!tx || !tx.blockNumber) {
        throw new Error(`Transaction ${txHash} not found`);
      }

      console.log(`✅ Found in block ${tx.blockNumber}`);

      // Extract addresses involved in transaction
      const addresses = new Set<string>();
      if (tx.from) addresses.add(tx.from.toLowerCase());
      if (tx.to) addresses.add(tx.to.toLowerCase());

      // Try to get receipt for additional addresses
      try {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt) {
          if (receipt.contractAddress) {
            addresses.add(receipt.contractAddress.toLowerCase());
          }
          receipt.logs.forEach((log) => addresses.add(log.address.toLowerCase()));
        }
      } catch (error) {
        // Continue without receipt data
      }

      // Ensure minimum 8 addresses
      const addressListL1 = [...addresses];
      const commonAddresses = [
        '0x85cc7da8Ee323325bcD678C7CFc4EB61e76657Fb',
        '0xd8eE65121e51aa8C75A6Efac74C4Bbd3C439F78f',
        '0x838F176D94990E06af9B57E470047F9978403195',
        '0x01E371b2aD92aDf90254df20EB73F68015E9A000',
        '0xbD224229Bf9465ea4318D45a8ea102627d6c27c7',
        '0x6FD430995A19a57886d94f8B5AF2349b8F40e887',
        '0x0CE8f6C9D4aD12e56E54018313761487d2D1fee9',
        '0x60be9978F805Dd4619F94a449a4a798155a05A56',
      ];

      for (const addr of commonAddresses) {
        if (addressListL1.length >= 8) break;
        if (!addressListL1.includes(addr.toLowerCase())) {
          addressListL1.push(addr.toLowerCase());
        }
      }

      // Generate L2 key pairs for state channel
      console.log('🔐 Generating L2 key pairs...');
      const l2KeyPairs = await Promise.all(
        addressListL1.map((addr) => generateL2KeyPair(addr))
      );
      const publicKeyListL2 = l2KeyPairs.map((kp) => kp.publicKey);
      const senderL2PrvKey = l2KeyPairs[0].privateKey;

      // Build simulation options
      const simulationOpts = {
        txNonce: BigInt(tx.nonce),
        rpcUrl,
        senderL2PrvKey,
        blockNumber: tx.blockNumber,
        contractAddress: (tx.to || tx.from) as `0x${string}`,
        userStorageSlots: [0],
        addressListL1: addressListL1 as `0x${string}`[],
        publicKeyListL2,
        callData: hexToBytes(tx.data),
      };

      console.log('⚙️  Creating synthesizer...');
      const synthesizerOpts = await createSynthesizerOptsForSimulationFromRPC(
        simulationOpts
      );
      const synthesizer = await createSynthesizer(synthesizerOpts);

      console.log('🔄 Synthesizing transaction...');
      const runTxResult = await synthesizer.synthesizeTX();

      console.log('📝 Generating circuit outputs...');
      const circuitGenerator = await createCircuitGenerator(synthesizer);
      circuitGenerator.writeOutputs();

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
