#!/usr/bin/env node

import { program } from 'commander';
import { SynthesizerAdapter } from '../adapters/synthesizerAdapter.js';
import { createEVM } from '../constructors.js';
import readline from 'readline';

// Default RPC URLs
const DEFAULT_RPC_URLS = {
  mainnet:
    'https://eth-mainnet.g.alchemy.com/v2/PbqCcGx1oHN7yNaFdUJUYqPEN0QSp23S',
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

      // Get RPC URL - either from options or use default
      const network = options.sepolia ? 'sepolia' : 'mainnet';
      const rpcUrl = options.rpcUrl || DEFAULT_RPC_URLS[network];

      console.log(
        `🌐 Network: ${network.charAt(0).toUpperCase() + network.slice(1)}`,
      );
      console.log(`📡 RPC URL: ${rpcUrl}`);
      console.log(`📋 Transaction: ${txHash}`);
      console.log('');

      const adapter = new SynthesizerAdapter(rpcUrl, !options.sepolia);

      console.log('📡 Fetching transaction data...');
      const result = await adapter.parseTransaction({
        txHash: txHash,
        contractAddr: options.contract,
        calldata: options.calldata,
        sender: options.sender,
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
  .action(async (options) => {
    console.log('🚀 Starting Interactive Demo Mode...');
    console.log('');

    const network = options.sepolia ? 'sepolia' : 'mainnet';
    const rpcUrl = options.rpcUrl || DEFAULT_RPC_URLS[network];

    console.log('📋 Demo Configuration:');
    console.log(
      `- Network: ${network.charAt(0).toUpperCase() + network.slice(1)}`,
    );
    console.log(`- RPC URL: ${rpcUrl}`);
    console.log('');

    console.log('🔄 Initializing Synthesizer...');
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
      const rpcUrl = DEFAULT_RPC_URLS[network];

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
  .option('-v, --verbose', 'Verbose output')
  .action(async (txHash, options) => {
    try {
      console.log('⚡ Direct Synthesis Mode');
      console.log('');

      if (!txHash) {
        console.error('❌ Transaction hash is required!');
        console.log('Usage: npm run synthesizer <TX_HASH>');
        process.exit(1);
      }

      const network = options.sepolia ? 'sepolia' : 'mainnet';
      const rpcUrl = DEFAULT_RPC_URLS[network];

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

      console.log('\n📊 Results:');
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
      console.log('');
      console.log('💡 Troubleshooting:');
      console.log('- Check if the transaction hash is valid (0x...)');
      console.log('- Verify the transaction exists on the network');
      console.log('- Try using --sepolia flag for testnet transactions');
      console.log('- Use --verbose flag for detailed error information');
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

// Force program to parse for Windows + tsx compatibility
// Original condition: if (import.meta.url === `file://${process.argv[1]}`) {

// More robust cross-platform solution (if needed):
// const isMainModule = () => {
//   try {
//     const moduleUrl = import.meta.url;
//     const scriptPath = `file://${process.argv[1]}`;
//     return moduleUrl === scriptPath ||
//            moduleUrl.replace(/\\/g, '/') === scriptPath.replace(/\\/g, '/') ||
//            process.argv[1].endsWith('src/cli/index.ts');
//   } catch {
//     return true; // Default to true for CLI usage
//   }
// };
// if (isMainModule()) {
//   program.parse();
// }

program.parse();
