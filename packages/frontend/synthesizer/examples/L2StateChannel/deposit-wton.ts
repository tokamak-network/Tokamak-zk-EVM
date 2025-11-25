/**
 * WTON Deposit Script for Channel 1
 *
 * This script:
 * 1. Swaps TON -> WTON for 3 accounts
 * 2. Approves WTON to Deposit Manager
 * 3. Deposits WTON to Channel 1
 */

import { ethers, parseEther, JsonRpcProvider } from 'ethers';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
const envPath = resolve(__dirname, '../../../../../.env');
config({ path: envPath });

// ============================================================================
// CONFIGURATION
// ============================================================================

const SEPOLIA_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';
const TON_ADDRESS = '0xa30fe40285B8f5c0457DbC3B7C8A280373c40044'; // TON token address
const WTON_ADDRESS = '0x79E0d92670106c85E9067b56B8F674340dCa0Bbd';
const DEPOSIT_MANAGER_ADDRESS = '0x2873519dea0C8fE39e12f5E93a94B78d270F0401';
const CHANNEL_ID = 2; // Channel 2 with WTON

// TON uses wei units (10^18), WTON uses ray units (10^27)
// When swapping: 1 TON (wei) = 1 WTON (ray), but numerically ray = wei * 10^9
const parseRay = (amount: string): bigint => {
  return BigInt(amount) * BigInt(10 ** 27);
};

const formatRay = (amount: bigint): string => {
  const divisor = BigInt(10 ** 27);
  const integer = amount / divisor;
  const decimal = amount % divisor;
  const decimalStr = decimal.toString().padStart(27, '0').substring(0, 6); // Show 6 decimal places
  return `${integer}.${decimalStr}`;
};

const TON_AMOUNT = parseEther('100'); // 100 TON in wei (for swap input)
const WTON_AMOUNT = parseRay('100'); // 100 WTON in ray (for deposit)

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
const MPT_KEYS = [
  '0x0000000000000000000000000000000000000000000000000000000000000001',
  '0x0000000000000000000000000000000000000000000000000000000000000002',
  '0x0000000000000000000000000000000000000000000000000000000000000003',
];

// ============================================================================
// ABIs
// ============================================================================

const TON_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
];

const WTON_ABI = [
  'function swapFromTON(uint256 tonAmount) returns (bool)', // NOT payable!
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
];

const DEPOSIT_MANAGER_ABI = [
  'function depositToken(uint256 channelId, address token, uint256 amount, bytes32 _mptKey) external',
];

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
  console.log('║           WTON Swap & Deposit Script - Channel 1            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Initialize provider
  const provider = new JsonRpcProvider(SEPOLIA_RPC_URL);
  console.log('🌐 Connected to Sepolia RPC\n');

  // Initialize contracts
  const tonContract = new ethers.Contract(TON_ADDRESS, TON_ABI, provider);
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

      // Check TON balance
      const tonWithSigner = tonContract.connect(wallet);
      const tonBalance = await tonWithSigner.balanceOf(address);
      console.log(`   💰 TON Balance: ${ethers.formatEther(tonBalance)} TON`);

      if (tonBalance < TON_AMOUNT) {
        console.log(`   ⚠️  Insufficient TON! Need ${ethers.formatEther(TON_AMOUNT)} TON`);
        console.log(`   Skipping ${name}...\n`);
        continue;
      }

      // Step 1a: Approve TON to WTON contract (TON uses wei)
      console.log(`\n   📝 Step 1a: Approving ${ethers.formatEther(TON_AMOUNT)} TON to WTON contract...`);
      const tonApproveTx = await tonWithSigner.approve(WTON_ADDRESS, TON_AMOUNT);
      await waitForTx(tonApproveTx, 'Approve TON to WTON');

      // Step 1b: Swap TON -> WTON (input: TON in wei, output: WTON in ray)
      console.log(`\n   📝 Step 1b: Swapping ${ethers.formatEther(TON_AMOUNT)} TON -> WTON...`);
      const wtonWithSigner = wtonContract.connect(wallet);
      const swapTx = await wtonWithSigner.swapFromTON(TON_AMOUNT);
      await waitForTx(swapTx, 'Swap TON->WTON');

      // Check WTON balance (WTON uses ray, not wei!)
      const wtonBalance = await wtonWithSigner.balanceOf(address);
      console.log(`   💰 WTON Balance: ${formatRay(wtonBalance)} WTON (ray units)`);

      // Step 2: Approve WTON to Deposit Manager (WTON uses ray)
      console.log(`\n   📝 Step 2: Approving ${formatRay(WTON_AMOUNT)} WTON to Deposit Manager...`);
      const approveTx = await wtonWithSigner.approve(DEPOSIT_MANAGER_ADDRESS, WTON_AMOUNT);
      await waitForTx(approveTx, 'Approve WTON');

      // Wait a bit for blockchain to sync
      await sleep(2000);

      // Step 3: Deposit WTON to Channel (WTON uses ray)
      console.log(`\n   📝 Step 3: Depositing ${formatRay(WTON_AMOUNT)} WTON to Channel ${CHANNEL_ID}...`);
      const depositManagerWithSigner = depositManager.connect(wallet);

      const depositTx = await depositManagerWithSigner.depositToken(CHANNEL_ID, WTON_ADDRESS, WTON_AMOUNT, mptKey);
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
        console.error(`   Error data:`, error.data);
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
  console.log(`   WTON Address: ${WTON_ADDRESS}`);
  console.log(`   Deposit Amount: ${formatRay(WTON_AMOUNT)} WTON per account (ray units)`);
  console.log(`   Total Deposited: ${formatRay(WTON_AMOUNT * BigInt(3))} WTON (if all succeeded)`);
  console.log('');
  console.log('💡 Important Note:');
  console.log('   - TON uses wei units (10^18)');
  console.log('   - WTON uses ray units (10^27)');
  console.log('   - 1 TON (wei) = 1 WTON (ray), but ray is 10^9 times larger numerically');
  console.log('');
  console.log('🔍 Next Steps:');
  console.log('   1. Verify channel state: getChannelState(2) should be 2 (Open)');
  console.log('   2. Run: tsx examples/L2StateChannel/onchain-channel-simulation.ts');
  console.log('');
}

// Run the script
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
