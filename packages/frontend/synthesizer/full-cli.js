#!/usr/bin/env node

const { program } = require('commander');
const { spawn } = require('child_process');
const path = require('path');

program
  .name('synthesizer-cli')
  .description('CLI tool for Tokamak zk-EVM Synthesizer')
  .version('0.0.10');

// Helper function to run the TypeScript CLI
function runTypescriptCli(args) {
  return new Promise((resolve, reject) => {
    const cliPath = path.join(__dirname, 'dist', 'esm', 'cli', 'index.js');
    const child = spawn('node', [cliPath, ...args], {
      stdio: 'inherit',
      cwd: __dirname,
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`CLI exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

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
    console.log(
      '- Mainnet: https://eth-mainnet.g.alchemy.com/v2/PbqCcGx1oHN7yNaFdUJUYqPEN0QSp23S',
    );
    console.log('- Sepolia: https://rpc.ankr.com/eth_sepolia');
  });

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
    const args = ['parse'];
    if (options.txHash) {
      args.push('-t', options.txHash);
    }
    if (options.rpcUrl) {
      args.push('-r', options.rpcUrl);
    }
    if (options.sepolia) {
      args.push('-s');
    }
    if (options.contract) {
      args.push('-c', options.contract);
    }
    if (options.calldata) {
      args.push('-d', options.calldata);
    }
    if (options.sender) {
      args.push('--sender', options.sender);
    }
    if (options.output) {
      args.push('-o', options.output);
    }
    if (options.verbose) {
      args.push('-v');
    }

    try {
      await runTypescriptCli(args);
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('demo')
  .description('Interactive demo mode - run multiple transactions')
  .option('-s, --sepolia', 'Use sepolia testnet (default: mainnet)')
  .option('-r, --rpc-url <url>', 'Custom RPC URL (overrides default)')
  .action(async (options) => {
    const args = ['demo'];
    if (options.sepolia) {
      args.push('-s');
    }
    if (options.rpcUrl) {
      args.push('-r', options.rpcUrl);
    }

    try {
      await runTypescriptCli(args);
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('synthesize')
  .description('Quick synthesis - just provide transaction hash')
  .option('-s, --sepolia', 'Use sepolia testnet (default: mainnet)')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    const args = ['synthesize'];
    if (options.sepolia) {
      args.push('-s');
    }
    if (options.verbose) {
      args.push('-v');
    }

    try {
      await runTypescriptCli(args);
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('run <txHash>')
  .description('Direct synthesis with transaction hash')
  .option('-s, --sepolia', 'Use sepolia testnet (default: mainnet)')
  .option('-v, --verbose', 'Verbose output')
  .action(async (txHash, options) => {
    const args = ['run', txHash];
    if (options.sepolia) {
      args.push('-s');
    }
    if (options.verbose) {
      args.push('-v');
    }

    try {
      await runTypescriptCli(args);
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('test-binary')
  .description('Test that the binary is working correctly')
  .action(() => {
    console.log('✅ Binary is working correctly!');
    console.log('📁 Current working directory:', process.cwd());
    console.log('🔧 Node.js version:', process.version);
    console.log('💻 Platform:', process.platform);
    console.log('🏗️  Architecture:', process.arch);

    // Test file system access
    const fs = require('fs');
    try {
      const files = fs.readdirSync('.');
      console.log('📂 Files in current directory:', files.length);
    } catch (error) {
      console.error('❌ File system access error:', error.message);
    }
  });

if (require.main === module) {
  program.parse();
}
