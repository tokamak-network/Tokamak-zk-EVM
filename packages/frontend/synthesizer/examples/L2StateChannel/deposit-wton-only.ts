/**
 * WTON Deposit Only Script for Channel 2
 *
 * Assumes:
 * - WTON already swapped
 * - WTON already approved to Deposit Manager
 * - Just performs depositToken for all 3 accounts
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
const WTON_ADDRESS = '0x79E0d92670106c85E9067b56B8F674340dCa0Bbd';
const DEPOSIT_MANAGER_ADDRESS = '0x2873519dea0C8fE39e12f5E93a94B78d270F0401';
const CHANNEL_ID = 2; // Channel 2 with WTON

// WTON uses ray units (10^27), not wei (10^18)
const parseRay = (amount: string): bigint => {
  return BigInt(amount) * BigInt(10 ** 27);
};

const formatRay = (amount: bigint): string => {
  const divisor = BigInt(10 ** 27);
  const integer = amount / divisor;
  const decimal = amount % divisor;
  const decimalStr = decimal.toString().padStart(27, '0').substring(0, 6);
  return `${integer}.${decimalStr}`;
};

const DEPOSIT_AMOUNT = parseRay('100'); // 100 WTON in ray units

// Read private keys from environment variables
const PRIVATE_KEYS = [process.env.ALICE_PRIVATE_KEY, process.env.BOB_PRIVATE_KEY, process.env.CHARLIE_PRIVATE_KEY];

// Validate private keys
if (!PRIVATE_KEYS[0] || !PRIVATE_KEYS[1] || !PRIVATE_KEYS[2]) {
  console.error('❌ Error: Private keys not found in .env file');
  process.exit(1);
}

const PARTICIPANT_NAMES = ['Alice', 'Bob', 'Charlie'];
const MPT_KEYS = [
  '0x0000000000000000000000000000000000000000000000000000000000000001',
  '0x0000000000000000000000000000000000000000000000000000000000000002',
  '0x0000000000000000000000000000000000000000000000000000000000000003',
];

// ============================================================================
// ABIs
// ============================================================================

const WTON_ABI = ['function balanceOf(address account) view returns (uint256)'];

const DEPOSIT_MANAGER_ABI = [
  'function depositToken(uint256 channelId, address token, uint256 amount, bytes32 _mptKey) external',
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function waitForTx(tx: any, description: string) {
  console.log(`   ⏳ Waiting for ${description} transaction...`);
  const receipt = await tx.wait();
  console.log(`   ✅ ${description} confirmed! Gas used: ${receipt.gasUsed.toString()}`);
  return receipt;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         WTON Deposit Only Script - Channel 2                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Initialize provider
  const provider = new JsonRpcProvider(SEPOLIA_RPC_URL);
  console.log('🌐 Connected to Sepolia RPC\n');

  // Initialize contracts
  const wtonContract = new ethers.Contract(WTON_ADDRESS, WTON_ABI, provider);
  const depositManager = new ethers.Contract(DEPOSIT_MANAGER_ADDRESS, DEPOSIT_MANAGER_ABI, provider);

  // Process each account
  for (let i = 0; i < 3; i++) {
    const name = PARTICIPANT_NAMES[i];
    const mptKey = MPT_KEYS[i];

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

      // Check WTON balance (WTON uses ray units, not wei!)
      const wtonBalance = await wtonContract.balanceOf(address);
      console.log(`   💰 WTON Balance: ${formatRay(wtonBalance)} WTON (ray units)`);

      if (wtonBalance < DEPOSIT_AMOUNT) {
        console.log(`   ⚠️  Insufficient WTON! Need ${formatRay(DEPOSIT_AMOUNT)} WTON`);
        console.log(`   Skipping ${name}...\n`);
        continue;
      }

      // Deposit WTON to Channel (WTON uses ray units)
      console.log(`\n   📝 Depositing ${formatRay(DEPOSIT_AMOUNT)} WTON to Channel ${CHANNEL_ID}...`);
      const depositManagerWithSigner = depositManager.connect(wallet);
      const depositTx = await depositManagerWithSigner.depositToken(CHANNEL_ID, WTON_ADDRESS, DEPOSIT_AMOUNT, mptKey);
      await waitForTx(depositTx, 'Deposit WTON');

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
        console.error('   Error data:', error.data);
      }
      // Continue to next participant even if one fails
    }
  }

  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Process Complete!                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('📊 Summary:');
  console.log(`   Channel ID: ${CHANNEL_ID}`);
  console.log(`   WTON Address: ${WTON_ADDRESS}`);
  console.log(`   Deposit Amount: ${formatRay(DEPOSIT_AMOUNT)} WTON per account (ray units)`);
  console.log(`   Total Deposited: ${formatRay(DEPOSIT_AMOUNT * BigInt(3))} WTON (if all succeeded)`);

  console.log('\n💡 Important Note:');
  console.log('   - WTON uses ray units (10^27), not wei (10^18)');

  console.log('\n🔍 Next Steps:');
  console.log('   1. Verify channel state: getChannelState(2) should be 2 (Open)');
  console.log('   2. Run: tsx examples/L2StateChannel/onchain-channel-simulation.ts\n');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
