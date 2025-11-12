#!/usr/bin/env node

import { program } from 'commander';
import { SynthesizerAdapter } from '../adapters/synthesizerAdapter.js';
import { createEVM } from '../constructors.js';
import readline from 'readline';

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
  sepolia: 'https://rpc.ankr.com/eth_sepolia',
};

// Helper function to get user input
function askQuestion(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

program
  .name('synthesizer-cli')
  .description('CLI tool for Tokamak zk-EVM Synthesizer')
  .version('0.0.10');

program
  .command('parse')
  .description('Parse and synthesize an Ethereum transaction')
  .option('-t, --tx-hash <hash>', 'Transaction hash to parse')
  .option('-r, --rpc-url <url>', 'RPC URL for blockchain data')
  .option('-s, --sepolia', 'Use sepolia testnet (default: mainnet)')
  .option('-c, --contract <address>', 'Contract address to verify')
  .option('-d, --calldata <data>', 'Calldata to verify')
  .option('--sender <address>', 'Sender address to verify')
  .option('-o, --output <file>', 'Output file for results (optional)')
  .option(
    '--output-dir <dir>',
    'Output directory for synthesis files (default: current directory)',
  )
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    try {
      console.log('🔄 Initializing Synthesizer...');

      // Get transaction hash - either from options or interactive input
      let txHash = options.txHash;
      if (!txHash) {
        console.log('');
        txHash = await askQuestion('📝 Enter transaction hash: ');
        if (!txHash) {
          console.error('❌ Transaction hash is required!');
          process.exit(1);
        }
      }

      // Get RPC URL - first options, then .env, then default for sepolia
      const network = options.sepolia ? 'sepolia' : 'mainnet';
      let rpcUrl = options.rpcUrl;
      
      if (!rpcUrl) {
        if (network === 'mainnet') {
          rpcUrl = process.env.RPC_URL;
          if (!rpcUrl) {
            console.error('Error: No RPC URL configured for mainnet');
            console.error('Run: ./tokamak-cli --install <API_KEY>');
            process.exit(1);
          }
        } else {
          // For sepolia, use default public RPC
          rpcUrl = DEFAULT_RPC_URLS[network];
        }
      }

      console.log(
        `🌐 Network: ${network.charAt(0).toUpperCase() + network.slice(1)}`,
      );
      console.log(`📡 RPC URL: ${rpcUrl}`);
      console.log(`📋 Transaction: ${txHash}`);
      console.log('');

      // Set output directory - default to directory where binary is located
      const outputDir =
        options.outputDir ||
        (() => {
          // Check if running as binary (pkg or bun) or in development
          if ((process as any).pkg || (process as any).isBun) {
            // Running as binary - use directory where binary is located
            return require('path').dirname(process.execPath);
          } else {
            // Running in development - use current working directory
            return process.cwd();
          }
        })();
      console.log(`📁 Output directory: ${outputDir}`);

      const adapter = new SynthesizerAdapter(rpcUrl, !options.sepolia);

      console.log('📡 Fetching transaction data...');
      const result = await adapter.parseTransaction({
        txHash: txHash,
        contractAddr: options.contract,
        calldata: options.calldata,
        sender: options.sender,
        outputPath: outputDir,
      });

      console.log('✅ Transaction parsed successfully!');

      if (options.verbose) {
        console.log('\n📊 Execution Results:');
        console.log('- Gas Used:', result.executionResult.executionGasUsed);
        console.log('- Success:', !result.executionResult.exceptionError);
        console.log(
          '- Placements:',
          result.evm.synthesizer.state.placements.size,
        );

        if (result.executionResult.exceptionError) {
          console.log('- Error:', result.executionResult.exceptionError.error);
        }
      }

      if (options.output) {
        const fs = await import('fs');
        const outputData = {
          txHash: txHash,
          gasUsed: result.executionResult.executionGasUsed.toString(),
          success: !result.executionResult.exceptionError,
          placements: result.evm.synthesizer.state.placements.size,
          permutation: {
            // Add relevant permutation data
            placementVariables:
              result.permutation.placementVariables?.length || 0,
            permutationFile: result.permutation.permutationFile?.length || 0,
          },
        };

        fs.writeFileSync(options.output, JSON.stringify(outputData, null, 2));
        console.log(`💾 Results saved to ${options.output}`);
      }
    } catch (error) {
      console.error(
        '❌ Error:',
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  });

program
  .command('demo')
  .description('Interactive demo mode - run multiple transactions')
  .option('-s, --sepolia', 'Use sepolia testnet (default: mainnet)')
  .option('-r, --rpc-url <url>', 'Custom RPC URL (overrides default)')
  .option(
    '--output-dir <dir>',
    'Output directory for synthesis files (default: current directory)',
  )
  .action(async (options) => {
    console.log('🚀 Starting Interactive Demo Mode...');
    console.log('');

    const network = options.sepolia ? 'sepolia' : 'mainnet';
    let rpcUrl = options.rpcUrl;
    
    if (!rpcUrl) {
      if (network === 'mainnet') {
        rpcUrl = process.env.RPC_URL;
        if (!rpcUrl) {
          console.error('Error: No RPC URL configured');
          console.error('Run: ./tokamak-cli --install <API_KEY>');
          process.exit(1);
        }
      } else {
        rpcUrl = DEFAULT_RPC_URLS[network];
      }
    }

    console.log('📋 Demo Configuration:');
    console.log(
      `- Network: ${network.charAt(0).toUpperCase() + network.slice(1)}`,
    );
    console.log(`- RPC URL: ${rpcUrl}`);
    console.log('');

    console.log('🔄 Initializing Synthesizer...');

    // Set output directory for demo mode
    const outputDir =
      options.outputDir ||
      (() => {
        if ((process as any).pkg || (process as any).isBun) {
          return require('path').dirname(process.execPath);
        } else {
          return process.cwd();
        }
      })();
    console.log(`📁 Output directory: ${outputDir}`);

    const adapter = new SynthesizerAdapter(rpcUrl, !options.sepolia);

    let continueDemo = true;
    let transactionCount = 0;

    while (continueDemo) {
      try {
        console.log('─'.repeat(50));
        console.log(`🔍 Transaction ${transactionCount + 1}`);
        console.log('');

        // Get transaction hash from user
        const txHash = await askQuestion('📝 Enter transaction hash: ');
        if (!txHash) {
          console.log('❌ Transaction hash is required!');
          continue;
        }

        console.log(`📋 Processing: ${txHash}`);
        console.log('📡 Fetching transaction data...');
        console.log('⏳ This may take a moment...');

        const startTime = Date.now();
        const result = await adapter.parseTransaction({
          txHash: txHash,
          outputPath: outputDir,
        });
        const endTime = Date.now();

        console.log('✅ Transaction processed successfully!');
        console.log('');
        console.log('📊 Results:');
        console.log(`- Processing Time: ${endTime - startTime}ms`);
        console.log(`- Gas Used: ${result.executionResult.executionGasUsed}`);
        console.log(
          `- Transaction Success: ${!result.executionResult.exceptionError}`,
        );
        console.log(
          `- Total Placements: ${result.evm.synthesizer.state.placements.size}`,
        );
        console.log(`- Circuit Synthesis: Complete`);

        if (result.executionResult.exceptionError) {
          console.log(
            `- Execution Error: ${result.executionResult.exceptionError.error}`,
          );
        }

        transactionCount++;
        console.log('');

        // Ask if user wants to continue
        const continueChoice = await askQuestion(
          '🔄 Do you want to process another transaction? (y/n): ',
        );

        if (
          continueChoice.toLowerCase() !== 'y' &&
          continueChoice.toLowerCase() !== 'yes'
        ) {
          continueDemo = false;
          console.log('');
          console.log('🎉 Demo session completed!');
          console.log(`📊 Total transactions processed: ${transactionCount}`);
          console.log('');
          console.log('💡 You can also use these commands:');
          console.log(
            '   npm run cli parse -t YOUR_TX_HASH    # Parse single transaction',
          );
          console.log(
            '   npm run synthesize                   # Quick synthesis mode',
          );
          console.log(
            '   npm run cli info                     # Show synthesizer info',
          );
        } else {
          console.log('');
        }
      } catch (error) {
        console.error(
          '❌ Transaction processing error:',
          error instanceof Error ? error.message : error,
        );
        console.log('');
        console.log('💡 Troubleshooting:');
        console.log('- Check if the RPC URL is accessible');
        console.log('- Verify the transaction hash exists on the network');
        console.log('- Try using a different RPC provider');
        console.log('- Make sure the transaction hash is valid (0x...)');
        console.log('');

        // Ask if user wants to continue even after error
        const continueChoice = await askQuestion(
          '🔄 Do you want to try another transaction? (y/n): ',
        );

        if (
          continueChoice.toLowerCase() !== 'y' &&
          continueChoice.toLowerCase() !== 'yes'
        ) {
          continueDemo = false;
          console.log('');
          console.log('👋 Exiting demo mode...');
        } else {
          console.log('');
        }
      }
    }
  });

program
  .command('synthesize')
  .description('Quick synthesis - just provide transaction hash')
  .option('-s, --sepolia', 'Use sepolia testnet (default: mainnet)')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    try {
      console.log('⚡ Quick Synthesize Mode');
      console.log('');

      const txHash = await askQuestion('📝 Enter transaction hash: ');
      if (!txHash) {
        console.error('❌ Transaction hash is required!');
        process.exit(1);
      }

      const network = options.sepolia ? 'sepolia' : 'mainnet';
      let rpcUrl;
      
      if (network === 'mainnet') {
        rpcUrl = process.env.RPC_URL;
        if (!rpcUrl) {
          console.error('Error: No RPC URL configured');
          console.error('Run: ./tokamak-cli --install <API_KEY>');
          process.exit(1);
        }
      } else {
        rpcUrl = DEFAULT_RPC_URLS[network];
      }

      console.log(
        `🌐 Network: ${network.charAt(0).toUpperCase() + network.slice(1)}`,
      );
      console.log(`📡 RPC URL: ${rpcUrl}`);
      console.log(`📋 Transaction: ${txHash}`);
      console.log('');

      const adapter = new SynthesizerAdapter(rpcUrl, !options.sepolia);

      console.log('🔄 Synthesizing transaction...');
      const startTime = Date.now();

      const result = await adapter.parseTransaction({
        txHash: txHash,
      });

      const endTime = Date.now();
      console.log('✅ Synthesis completed!');

      console.log('\n📊 Quick Results:');
      console.log(`- Processing Time: ${endTime - startTime}ms`);
      console.log(`- Gas Used: ${result.executionResult.executionGasUsed}`);
      console.log(`- Success: ${!result.executionResult.exceptionError}`);
      console.log(
        `- Placements: ${result.evm.synthesizer.state.placements.size}`,
      );

      if (options.verbose && result.executionResult.exceptionError) {
        console.log(`- Error: ${result.executionResult.exceptionError.error}`);
      }
    } catch (error) {
      console.error(
        '❌ Synthesis error:',
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  });

program
  .command('run <txHash>')
  .description(
    'Direct synthesis with transaction hash - npm run synthesizer <TX_HASH>',
  )
  .option('-s, --sepolia', 'Use sepolia testnet (default: mainnet)')
  .option('-r, --rpc <url>', 'Custom RPC URL (overrides env)')
  .option('-v, --verbose', 'Verbose output')
  .action(async (txHash, options) => {
    try {
      console.log('⚡ Direct Synthesis Mode (L2 State Channel)');
      console.log('');

      if (!txHash) {
        console.error('❌ Transaction hash is required!');
        console.log('Usage: npm run synthesizer <TX_HASH>');
        process.exit(1);
      }

      // Normalize tx hash
      if (!txHash.startsWith('0x')) {
        txHash = '0x' + txHash;
      }

      const network = options.sepolia ? 'sepolia' : 'mainnet';
      let rpcUrl = options.rpc;
      
      if (!rpcUrl) {
        if (network === 'mainnet') {
          rpcUrl = process.env.RPC_URL;
          if (!rpcUrl) {
            console.error('Error: No RPC URL configured');
            console.error('Run: ./tokamak-cli --install <API_KEY>');
            process.exit(1);
          }
        } else {
          rpcUrl = DEFAULT_RPC_URLS[network];
        }
      }

      console.log(
        `🌐 Network: ${network.charAt(0).toUpperCase() + network.slice(1)}`,
      );
      console.log(`📡 RPC URL: ${rpcUrl.substring(0, 40)}...`);
      console.log(`📋 Transaction: ${txHash}`);
      console.log('');

      // Import L2 synthesizer modules
      const { ethers } = await import('ethers');
      const { jubjub } = await import('@noble/curves/misc');
      const {
        bytesToBigInt,
        setLengthLeft,
        utf8ToBytes,
        hexToBytes,
        concatBytes,
      } = await import('@ethereumjs/util');
      const { fromEdwardsToAddress } = await import('../../TokamakL2JS/index.ts');
      const {
        createSynthesizerOptsForSimulationFromRPC,
      } = await import('../rpc/rpc.ts');
      const { createSynthesizer } = await import('../../synthesizer/index.ts');
      const { createCircuitGenerator } = await import(
        '../../circuitGenerator/circuitGenerator.ts'
      );

      // Helper to generate L2 key pairs
      // Uses simple string seeds like the example code
      function generateL2KeyPair(index: number) {
        const seedString = `L2_SEED_${index}`;
        const seed = setLengthLeft(utf8ToBytes(seedString), 32);
        const { secretKey, publicKey } = jubjub.keygen(seed);
        return { privateKey: secretKey, publicKey };
      }

      console.log('📥 Fetching transaction details...');
      const startTime = Date.now();
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const tx = await provider.getTransaction(txHash);

      if (!tx || !tx.blockNumber) {
        throw new Error(`Transaction ${txHash} not found`);
      }

      console.log(`✅ Transaction found in block ${tx.blockNumber}`);

      // Extract addresses
      const addresses = new Set<string>();
      if (tx.from) addresses.add(tx.from.toLowerCase());
      if (tx.to) addresses.add(tx.to.toLowerCase());

      // Try to get receipt for more addresses
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

      // Pad to minimum 8 addresses
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

      // Generate L2 key pairs
      console.log('🔐 Generating L2 key pairs for state channel...');
      const l2KeyPairs = addressListL1.map((_, idx) => generateL2KeyPair(idx));
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

      console.log('⚙️  Creating synthesizer with L2 state channel...');
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
      console.log('✅ Synthesis completed!');

      console.log('\n📊 Results:');
      console.log(`- Processing Time: ${endTime - startTime}ms`);
      console.log(`- Gas Used: ${runTxResult.totalGasSpent}`);
      console.log(`- Success: ${!runTxResult.execResult.exceptionError}`);
      console.log(`- L2 Addresses Mapped: ${addressListL1.length}`);

      if (options.verbose) {
        if (runTxResult.execResult.logs) {
          console.log(`- Log Entries: ${runTxResult.execResult.logs.length}`);
        }
        if (runTxResult.execResult.exceptionError) {
          console.log(`- Error: ${runTxResult.execResult.exceptionError.error}`);
        }
      }

      console.log('📁 Outputs written to: examples/outputs/');
    } catch (error) {
      console.error(
        '❌ Synthesis error:',
        error instanceof Error ? error.message : error,
      );
      if (options.verbose && error instanceof Error) {
        console.error(error.stack);
      }
      console.log('');
      console.log('💡 Troubleshooting:');
      console.log('- Check if the transaction hash is valid (0x...)');
      console.log('- Verify the transaction exists on the network');
      console.log('- Try using --sepolia flag for testnet transactions');
      console.log('- Use --verbose flag for detailed error information');
      console.log('- Make sure RPC_URL is configured in .env');
      process.exit(1);
    }
  });

program
  .command('info')
  .description('Show synthesizer information')
  .action(() => {
    console.log('🔧 Tokamak zk-EVM Synthesizer');
    console.log('Version: 0.0.10');
    console.log(
      'Description: Interprets Ethereum transactions as combinations of library subcircuits',
    );
    console.log('\nSupported operations:');
    console.log('- EVM opcode synthesis');
    console.log('- Circuit placement management');
    console.log('- Permutation generation');
    console.log('- Zero-knowledge proof preparation');
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
