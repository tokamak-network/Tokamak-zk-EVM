/**
 * Open Channel 2 - Initialize Channel State
 *
 * Transitions Channel 2 from "Initialized" to "Open" state
 */

import { ethers, parseEther, JsonRpcProvider } from 'ethers';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
config({ path: resolve(__dirname, '../../../../../.env') });

// ============================================================================
// CONFIGURATION
// ============================================================================

const SEPOLIA_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';
const ROLLUP_BRIDGE_ADDRESS = '0x780ad1b236390C42479b62F066F5cEeAa4c77ad6';
const CHANNEL_ID = 2;

// Bob is the leader
const BOB_PRIVATE_KEY = process.env.BOB_PRIVATE_KEY;

if (!BOB_PRIVATE_KEY) {
  console.error('❌ Error: BOB_PRIVATE_KEY not found');
  process.exit(1);
}

// ============================================================================
// ABI
// ============================================================================

const ROLLUP_BRIDGE_ABI = [
  'function initializeChannelState(uint256 channelId) external',
  'function getChannelState(uint256 channelId) view returns (uint8)',
];

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║              Open Channel 2 - Initialize State               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const provider = new JsonRpcProvider(SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(BOB_PRIVATE_KEY, provider);

  console.log('🌐 Connected to Sepolia RPC');
  console.log(`👤 Leader (Bob): ${wallet.address}\n`);

  const rollupBridge = new ethers.Contract(ROLLUP_BRIDGE_ADDRESS, ROLLUP_BRIDGE_ABI, wallet);

  // Check current state
  console.log('📊 Checking channel state...');
  const currentState = await rollupBridge.getChannelState(CHANNEL_ID);
  console.log(
    `   Current State: ${currentState} (${['None', 'Initialized', 'Open', 'Active', 'Closing', 'Closed'][Number(currentState)]})\n`,
  );

  if (Number(currentState) === 2) {
    console.log('✅ Channel is already Open!');
    return;
  }

  if (Number(currentState) !== 1) {
    console.error('❌ Channel must be in Initialized state');
    return;
  }

  try {
    console.log('📝 Calling initializeChannelState...');
    const tx = await rollupBridge.initializeChannelState(CHANNEL_ID);

    console.log(`⏳ Transaction sent: ${tx.hash}`);
    console.log(`🔗 https://sepolia.etherscan.io/tx/${tx.hash}\n`);

    console.log('⏳ Waiting for confirmation...');
    const receipt = await tx.wait();

    console.log(`✅ Confirmed! Block: ${receipt.blockNumber}, Gas: ${receipt.gasUsed.toString()}\n`);

    // Check new state
    const newState = await rollupBridge.getChannelState(CHANNEL_ID);
    console.log(
      `📊 New State: ${newState} (${['None', 'Initialized', 'Open', 'Active', 'Closing', 'Closed'][Number(newState)]})`,
    );

    if (Number(newState) === 2) {
      console.log('\n🎉 Success! Channel 2 is now OPEN! 🎉\n');
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
