/**
 * TON Deposit Script
 *
 * This script:
 * 1. Approves TON to Deposit Manager
 * 2. Deposits TON to specified channel
 *
 * Usage:
 *   tsx examples/L2StateChannel/deposit-ton.ts <channelId>
 *   Example: tsx examples/L2StateChannel/deposit-ton.ts 6
 */

import { ethers, parseEther, JsonRpcProvider } from 'ethers';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateMptKeyFromWallet } from './mpt-key-utils.ts';
import {
  SEPOLIA_RPC_URL,
  TON_ADDRESS,
  DEPOSIT_MANAGER_PROXY_ADDRESS,
  ROLLUP_BRIDGE_CORE_ADDRESS,
  TON_ABI,
  DEPOSIT_MANAGER_ABI,
  ROLLUP_BRIDGE_CORE_ABI,
  TON_DEPOSIT_AMOUNT,
} from './constants.ts';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
const envPath = resolve(__dirname, '../../../../../.env');
config({ path: envPath });

// ============================================================================
// CONFIGURATION
// ============================================================================

// Parse channel ID from command line arguments
const CHANNEL_ID_RAW = process.argv[2] ? parseInt(process.argv[2], 10) : null;

if (!CHANNEL_ID_RAW || isNaN(CHANNEL_ID_RAW)) {
  console.error('❌ Error: Channel ID is required');
  console.error('Usage: tsx examples/L2StateChannel/deposit-ton.ts <channelId>');
  console.error('Example: tsx examples/L2StateChannel/deposit-ton.ts 6');
  process.exit(1);
}

const CHANNEL_ID: number = CHANNEL_ID_RAW;

const TON_AMOUNT = parseEther('1'); // 1 TON in wei

// Read private keys from environment variables
const PRIVATE_KEYS = [process.env.ALICE_PRIVATE_KEY, process.env.BOB_PRIVATE_KEY, process.env.CHARLIE_PRIVATE_KEY];

// Validate private keys
if (!PRIVATE_KEYS[0] || !PRIVATE_KEYS[1] || !PRIVATE_KEYS[2]) {
  console.error('❌ Error: Private keys not found in .env file');
  console.error('Please add the following to your .env file:');
  console.error('  ALICE_PRIVATE_KEY="..."');
  console.error('  BOB_PRIVATE_KEY="..."');
  console.error('  CHARLIE_PRIVATE_KEY="..."');
  process.exit(1);
}

const PARTICIPANT_NAMES = ['Alice', 'Bob', 'Charlie'];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get channel state name from state number
 */
function getStateName(state: number): string {
  const states = ['None', 'Initialized', 'Open', 'Active', 'Closing', 'Closed'];
  return states[state] || `Unknown(${state})`;
}

// ============================================================================
// MPT KEY GENERATION
// ============================================================================
// MPT key generation is now handled by mpt-key-utils.ts
// Use generateMptKeyFromWallet() from the utils module

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForTx(tx: any, name: string) {
  console.log(`   ⏳ Waiting for ${name} transaction...`);
  const receipt = await tx.wait();
  console.log(`   ✅ ${name} confirmed! Gas used: ${receipt.gasUsed.toString()}`);
  return receipt;
}

// ============================================================================
// MAIN SCRIPT
// ============================================================================

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║              TON Deposit Script                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log(`📋 Configuration:`);
  console.log(`   Channel ID: ${CHANNEL_ID}`);
  console.log(`   Token: TON (${TON_ADDRESS})`);
  console.log(`   Deposit Amount: ${ethers.formatEther(TON_AMOUNT)} TON per account`);
  console.log(`   Deposit Manager: ${DEPOSIT_MANAGER_PROXY_ADDRESS}\n`);

  // Initialize provider
  const provider = new JsonRpcProvider(SEPOLIA_RPC_URL);
  console.log('🌐 Connected to Sepolia RPC\n');

  // Initialize contracts
  const tonContract = new ethers.Contract(TON_ADDRESS, TON_ABI, provider);
  const depositManager = new ethers.Contract(DEPOSIT_MANAGER_PROXY_ADDRESS, DEPOSIT_MANAGER_ABI, provider);
  const bridgeContract = new ethers.Contract(ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, provider);

  // Check channel state before processing
  console.log('🔍 Checking channel state...\n');
  try {
    const [allowedTokens, state, participantCount, initialRoot] = await bridgeContract.getChannelInfo(CHANNEL_ID);
    const stateNum = Number(state);
    const stateName = getStateName(stateNum);

    console.log(`   Channel ID: ${CHANNEL_ID}`);
    console.log(`   State: ${stateNum} (${stateName})`);
    console.log(`   Participants: ${participantCount}`);
    console.log(`   Allowed Tokens: ${allowedTokens.length}`);
    allowedTokens.forEach((token: string, idx: number) => {
      console.log(`     ${idx + 1}. ${token}`);
    });
    console.log(`   Initial Root: ${initialRoot}\n`);

    // Validate channel state (deposit is allowed in states 1, 2, or 3)
    if (stateNum === 0) {
      console.error('❌ Error: Channel is not initialized (state = 0)');
      console.error('   Please initialize the channel first using initializeChannelState()');
      process.exit(1);
    }
    if (stateNum === 4 || stateNum === 5) {
      console.error(`❌ Error: Channel is ${stateName} (state = ${stateNum})`);
      console.error('   Deposits are not allowed in this state');
      process.exit(1);
    }
    if (stateNum !== 1 && stateNum !== 2 && stateNum !== 3) {
      console.error(`❌ Error: Channel is in unknown state (state = ${stateNum})`);
      process.exit(1);
    }

    // Check if TON is in allowed tokens
    const tonAllowed = allowedTokens.some((token: string) => token.toLowerCase() === TON_ADDRESS.toLowerCase());
    if (!tonAllowed) {
      console.error(`❌ Error: TON (${TON_ADDRESS}) is not in allowed tokens for this channel`);
      console.error('   Allowed tokens:', allowedTokens.join(', '));
      process.exit(1);
    }

    console.log('✅ Channel state is valid for deposits\n');
  } catch (error: any) {
    console.error('❌ Error checking channel state:', error.message);
    if (error.reason?.includes('Channel does not exist')) {
      console.error(`   Channel ${CHANNEL_ID} does not exist. Please create it first.`);
    }
    process.exit(1);
  }

  // Process each account
  for (let i = 0; i < 3; i++) {
    const name = PARTICIPANT_NAMES[i];

    console.log(`\n${'='.repeat(80)}`);
    console.log(`👤 Processing ${name} (Account ${i + 1}/3)`);
    console.log('='.repeat(80));

    try {
      // Create wallet from private key
      const privateKey = PRIVATE_KEYS[i]!;
      const wallet = new ethers.Wallet(privateKey, provider);
      const address = await wallet.getAddress();
      console.log(`   Address: ${address}`);

      // Check ETH balance
      const ethBalance = await provider.getBalance(address);
      console.log(`   ETH Balance: ${ethers.formatEther(ethBalance)} ETH`);

      if (ethBalance < parseEther('0.001')) {
        console.log(`   ⚠️  Low ETH balance! Need at least 0.001 ETH for gas`);
        console.log(`   Skipping ${name}...\n`);
        continue;
      }

      // Check TON balance
      const tonWithSigner = tonContract.connect(wallet) as ethers.Contract;
      const tonBalance = await tonWithSigner.balanceOf(address);
      console.log(`   💰 TON Balance: ${ethers.formatEther(tonBalance)} TON`);

      if (tonBalance < TON_AMOUNT) {
        console.log(`   ⚠️  Insufficient TON! Need ${ethers.formatEther(TON_AMOUNT)} TON`);
        console.log(`   Skipping ${name}...\n`);
        continue;
      }

      // Generate MPT key for this participant
      // Pass wallet to extract L1 public key
      // Note: MPT key is deterministic - same inputs (L1 public key, channel ID, participant name, token, slot)
      // will always produce the same MPT key
      const mptKey = generateMptKeyFromWallet(wallet, name, CHANNEL_ID, TON_ADDRESS, 0);
      console.log(`   🔑 L1 Public Key: ${wallet.signingKey.publicKey}`);
      console.log(`   🔑 MPT Key: ${mptKey}`);
      console.log(`   📝 Note: MPT key is deterministic based on:`);
      console.log(`      - L1 Public Key: ${wallet.signingKey.publicKey.substring(0, 20)}...`);
      console.log(`      - Channel ID: ${CHANNEL_ID}`);
      console.log(`      - Participant: ${name}`);
      console.log(`      - Token: ${TON_ADDRESS}`);
      console.log(`      - Slot: 0`);

      // Step 1: Approve TON to Deposit Manager
      console.log(`\n   📝 Step 1: Approving ${ethers.formatEther(TON_AMOUNT)} TON to Deposit Manager...`);
      const approveTx = await tonWithSigner.approve(DEPOSIT_MANAGER_PROXY_ADDRESS, TON_AMOUNT);
      await waitForTx(approveTx, 'Approve TON');

      // Wait a bit for blockchain to sync
      await sleep(2000);

      // Step 2: Deposit TON to Channel
      console.log(`\n   📝 Step 2: Depositing ${ethers.formatEther(TON_AMOUNT)} TON to Channel ${CHANNEL_ID}...`);
      const depositManagerWithSigner = depositManager.connect(wallet) as ethers.Contract;

      const depositTx = await depositManagerWithSigner.depositToken(CHANNEL_ID, TON_ADDRESS, TON_AMOUNT, mptKey);
      await waitForTx(depositTx, 'Deposit TON');

      console.log(`\n   ✅ ${name} completed successfully!`);
      console.log(`   📝 Deposit Tx: https://sepolia.etherscan.io/tx/${depositTx.hash}`);

      // Wait between accounts to avoid nonce issues
      if (i < PARTICIPANT_NAMES.length - 1) {
        console.log(`\n   ⏸️  Waiting 5 seconds before next account...`);
        await sleep(5000);
      }
    } catch (error: any) {
      console.error(`\n   ❌ Error processing ${name}:`, error.message);
      if (error.data) {
        console.error(`   Error data:`, error.data);
      }
      if (error.reason) {
        console.error(`   Reason:`, error.reason);
      }
      console.log(`   Skipping ${name} and continuing...\n`);
      continue;
    }
  }

  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Process Complete!                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('📊 Summary:');
  console.log(`   Channel ID: ${CHANNEL_ID}`);
  console.log(`   Token: TON (${TON_ADDRESS})`);
  console.log(`   Deposit Amount: ${ethers.formatEther(TON_AMOUNT)} TON per account`);
  console.log(`   Total Deposited: ${ethers.formatEther(TON_AMOUNT * BigInt(3))} TON (if all succeeded)`);
  console.log('');
  console.log('💡 Important Note:');
  console.log('   - TON uses wei units (10^18)');
  console.log('   - MPT key generation is currently using placeholder implementation');
  console.log('   - Please implement proper MPT key generation before production use');
  console.log('');
  console.log('🔍 Next Steps:');
  console.log(`   1. Verify channel state: getChannelInfo(${CHANNEL_ID})`);
  console.log('   2. Implement proper MPT key generation in generateMptKey() function');
  console.log('');
}

// Run the script
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
