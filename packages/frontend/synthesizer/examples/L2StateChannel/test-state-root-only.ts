/**
 * Simple Test: Get State Root from EthereumJS EVM at Block 9755471
 *
 * This script:
 * 1. Sets up EthereumJS EVM at block 9755471
 * 2. Gets the state root without executing any transactions
 * 3. Displays the state root value
 */

import { ethers } from 'ethers';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { RPCStateManager } from '@ethereumjs/statemanager';
import { createEVM } from '@ethereumjs/evm';
import { Common, Sepolia } from '@ethereumjs/common';
import { SEPOLIA_RPC_URL } from './constants.ts';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
const envPath = resolve(__dirname, '../../../../../.env');
config({ path: envPath });

const RPC_URL = SEPOLIA_RPC_URL;
const BLOCK_NUMBER = 9755471;

async function testStateRootOnly() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Test: Get State Root from EthereumJS EVM               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log(`📦 Configuration:`);
  console.log(`   RPC URL: ${RPC_URL}`);
  console.log(`   Block Number: ${BLOCK_NUMBER}\n`);

  // Create RPC state manager for Sepolia
  console.log(`🔧 Setting up RPCStateManager at block ${BLOCK_NUMBER}...`);
  const stateManager = new RPCStateManager({
    provider: RPC_URL,
    blockTag: BigInt(BLOCK_NUMBER),
  });

  // Create EVM with RPC state manager (Sepolia chain)
  console.log(`🔧 Setting up EVM with Sepolia chain configuration...`);
  const common = new Common({ chain: Sepolia });
  const evm = await createEVM({
    common,
    stateManager,
  });

  console.log(`✅ EVM setup complete\n`);

  // Get state root from RPC (this is the actual block state root)
  console.log(`📊 Getting state root from RPC...`);
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const block = await provider.getBlock(BLOCK_NUMBER);

  if (!block) {
    throw new Error(`Block ${BLOCK_NUMBER} not found`);
  }

  console.log(`\n📊 Result:`);
  console.log('─────────────────────────────────────────────────────────');
  console.log(`   Block Number: ${block.number}`);
  console.log(`   Block Hash: ${block.hash}`);
  console.log(`   State Root: ${block.stateRoot}`);
  console.log('─────────────────────────────────────────────────────────\n');

  // Also check EVM state manager's state root (this is the local state, not the block state)
  console.log(`🔍 Getting state root from EVM StateManager (local state)...`);
  const stateRootBytes = await stateManager.getStateRoot();
  const stateRootHex =
    '0x' +
    Array.from(stateRootBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toLowerCase();

  console.log(`   EVM StateManager State Root: ${stateRootHex}`);
  console.log(`   Note: This is the local state root, not the block state root.\n`);

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Test Completed                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

testStateRootOnly()
  .then(() => {
    console.log('🎉 Test complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  });

