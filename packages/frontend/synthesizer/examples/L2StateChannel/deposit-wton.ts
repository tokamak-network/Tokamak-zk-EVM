/**
 * TON & WTON Deposit Script for Channel 2
 *
 * This script:
 * 1. Fetches channel 2 participants and their L2 MPT keys from on-chain
 * 2. Swaps TON -> WTON for each participant
 * 3. Approves TON and WTON to Deposit Manager
 * 4. Deposits TON (100) and WTON (100) to Channel 2
 * 5. Verifies on-chain deposit changes
 */

import { ethers, parseEther, JsonRpcProvider } from 'ethers';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { bigIntToBytes, setLengthLeft, bytesToBigInt } from '@ethereumjs/util';
import { jubjub } from '@noble/curves/misc';
import {
  SEPOLIA_RPC_URL,
  ROLLUP_BRIDGE_CORE_ADDRESS,
  ROLLUP_BRIDGE_DEPOSIT_MANAGER_ADDRESS,
  CHANNEL_ID,
  TON_ADDRESS,
  WTON_ADDRESS,
  TON_ABI,
  WTON_ABI,
  DEPOSIT_MANAGER_ABI,
  ROLLUP_BRIDGE_CORE_ABI,
  parseRay,
  formatRay,
  publicKeyToL2Address,
  generateL2StorageKey,
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

// Use Deposit Manager for deposits
const DEPOSIT_MANAGER_ADDRESS = ROLLUP_BRIDGE_DEPOSIT_MANAGER_ADDRESS;

const TON_AMOUNT = parseEther('100'); // 100 TON in wei (for swap input and deposit)
const WTON_AMOUNT = parseRay('100'); // 100 WTON in ray (for deposit)
const TON_DEPOSIT_AMOUNT = parseEther('100'); // 100 TON in wei (for deposit) - same as TON_AMOUNT

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

// Will be fetched from on-chain
let PARTICIPANT_ADDRESSES: string[] = [];
let PARTICIPANT_NAMES: string[] = [];
let TON_MPT_KEYS: string[] = [];
let WTON_MPT_KEYS: string[] = [];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Note: publicKeyToL2Address and generateL2StorageKey are now imported from constants.ts

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForTx(tx: any, name: string) {
  console.log(`   ⏳ Waiting for ${name} transaction...`);
  const receipt = await tx.wait();
  console.log(`   ✅ ${name} confirmed! Gas used: ${receipt.gasUsed.toString()}`);
  return receipt;
}

async function fetchChannelParticipants(provider: JsonRpcProvider): Promise<void> {
  console.log(`🔍 Fetching channel ${CHANNEL_ID} participants and MPT keys from on-chain...\n`);

  const bridgeContract = new ethers.Contract(ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, provider);

  // Get participants
  PARTICIPANT_ADDRESSES = await bridgeContract.getChannelParticipants(CHANNEL_ID);
  console.log(`✅ Found ${PARTICIPANT_ADDRESSES.length} participants:`);

  // Generate participant names and fetch MPT keys
  PARTICIPANT_NAMES = [];
  TON_MPT_KEYS = [];
  WTON_MPT_KEYS = [];

  for (let i = 0; i < PARTICIPANT_ADDRESSES.length; i++) {
    const address = PARTICIPANT_ADDRESSES[i];
    PARTICIPANT_NAMES.push(`Participant ${i + 1}`);

    // Get participant public key from contract
    let l2Address: string;
    let pkx: bigint;
    let pky: bigint;
    try {
      const [pkxBigInt, pkyBigInt] = await bridgeContract.getParticipantPublicKey(CHANNEL_ID, address);
      pkx = BigInt(pkxBigInt.toString());
      pky = BigInt(pkyBigInt.toString());
      l2Address = publicKeyToL2Address(pkx, pky);
    } catch (error: any) {
      console.warn(`   ⚠️  Could not fetch public key for ${address}: ${error.message}`);
      console.warn(`   🔧 Generating deterministic L2 key for testing...`);
      // Fallback: Generate deterministic private key from index
      const privateKey = setLengthLeft(bigIntToBytes(BigInt(i + 1) * 123456789n), 32);
      const publicKey = jubjub.Point.BASE.multiply(bytesToBigInt(privateKey));
      pkx = publicKey.x;
      pky = publicKey.y;
      l2Address = publicKeyToL2Address(pkx, pky);
    }

    // Calculate MPT keys from L2 address, slot, and token address
    // Including token address ensures different MPT keys for different tokens
    // This prevents collisions when the same participant deposits multiple tokens
    const tonMptKeyHex = generateL2StorageKey(l2Address, 0n, TON_ADDRESS);
    const wtonMptKeyHex = generateL2StorageKey(l2Address, 0n, WTON_ADDRESS);
    TON_MPT_KEYS.push(tonMptKeyHex);
    WTON_MPT_KEYS.push(wtonMptKeyHex);

    // Get current deposits
    const tonDeposit = await bridgeContract.getParticipantTokenDeposit(CHANNEL_ID, address, TON_ADDRESS);
    const wtonDeposit = await bridgeContract.getParticipantTokenDeposit(CHANNEL_ID, address, WTON_ADDRESS);

    console.log(`   ${i + 1}. ${address}`);
    console.log(`      L2 Address: ${l2Address}`);
    console.log(`      Public Key: (${pkx.toString(16)}, ${pky.toString(16)})`);
    console.log(`      TON MPT Key (calculated): ${tonMptKeyHex}`);
    console.log(`      WTON MPT Key (calculated): ${wtonMptKeyHex}`);
    console.log(`      TON Deposit: ${tonDeposit.toString()} wei (${ethers.formatEther(tonDeposit)} TON)`);
    console.log(
      `      WTON Deposit: ${wtonDeposit.toString()} wei (${wtonDeposit / BigInt(10 ** 18)} WTON, ${wtonDeposit / BigInt(10 ** 27)} RAY)`,
    );
  }
  console.log('');
}

async function verifyDeposits(
  provider: JsonRpcProvider,
  beforeDeposits: Map<string, { ton: bigint; wton: bigint }>,
): Promise<void> {
  console.log('\n🔍 Verifying on-chain deposit changes...\n');

  const bridgeContract = new ethers.Contract(ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, provider);

  for (let i = 0; i < PARTICIPANT_ADDRESSES.length; i++) {
    const address = PARTICIPANT_ADDRESSES[i];
    const before = beforeDeposits.get(address) || { ton: 0n, wton: 0n };
    const afterTon = await bridgeContract.getParticipantTokenDeposit(CHANNEL_ID, address, TON_ADDRESS);
    const afterWton = await bridgeContract.getParticipantTokenDeposit(CHANNEL_ID, address, WTON_ADDRESS);

    const tonDiff = afterTon - before.ton;
    const wtonDiff = afterWton - before.wton;

    console.log(`👤 ${PARTICIPANT_NAMES[i]} (${address.slice(0, 10)}...${address.slice(-8)}):`);
    console.log(`   TON:`);
    console.log(`      Before: ${before.ton.toString()} wei (${ethers.formatEther(before.ton)} TON)`);
    console.log(`      After:  ${afterTon.toString()} wei (${ethers.formatEther(afterTon)} TON)`);
    console.log(`      Change: ${tonDiff.toString()} wei (${ethers.formatEther(tonDiff)} TON)`);
    if (tonDiff > 0n) {
      console.log(`      ✅ Deposit increased!`);
    } else if (tonDiff < 0n) {
      console.log(`      ⚠️  Deposit decreased!`);
    } else {
      console.log(`      ℹ️  No change`);
    }

    console.log(`   WTON:`);
    const beforeWTON = before.wton / BigInt(10 ** 18);
    const beforeRAY = before.wton / BigInt(10 ** 27);
    const afterWTON = afterWton / BigInt(10 ** 18);
    const afterRAY = afterWton / BigInt(10 ** 27);
    const diffWTON = wtonDiff / BigInt(10 ** 18);
    const diffRAY = wtonDiff / BigInt(10 ** 27);
    console.log(
      `      Before: ${before.wton.toString()} wei (${beforeWTON.toString()} WTON, ${beforeRAY.toString()} RAY)`,
    );
    console.log(`      After:  ${afterWton.toString()} wei (${afterWTON.toString()} WTON, ${afterRAY.toString()} RAY)`);
    console.log(`      Change: ${wtonDiff.toString()} wei (${diffWTON.toString()} WTON, ${diffRAY.toString()} RAY)`);
    if (wtonDiff > 0n) {
      console.log(`      ✅ Deposit increased!`);
    } else if (wtonDiff < 0n) {
      console.log(`      ⚠️  Deposit decreased!`);
    } else {
      console.log(`      ℹ️  No change`);
    }
    console.log('');
  }
}

// ============================================================================
// MAIN SCRIPT
// ============================================================================

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║        TON & WTON Swap & Deposit Script - Channel ${CHANNEL_ID}         ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Initialize provider
  const provider = new JsonRpcProvider(SEPOLIA_RPC_URL);
  console.log('🌐 Connected to Sepolia RPC\n');

  // Fetch channel participants and MPT keys
  await fetchChannelParticipants(provider);

  // Store initial deposits for comparison
  const bridgeContract = new ethers.Contract(ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, provider);
  const beforeDeposits = new Map<string, { ton: bigint; wton: bigint }>();
  for (const address of PARTICIPANT_ADDRESSES) {
    const tonDeposit = await bridgeContract.getParticipantTokenDeposit(CHANNEL_ID, address, TON_ADDRESS);
    const wtonDeposit = await bridgeContract.getParticipantTokenDeposit(CHANNEL_ID, address, WTON_ADDRESS);
    beforeDeposits.set(address, { ton: tonDeposit, wton: wtonDeposit });
  }

  // Initialize contracts
  const tonContract = new ethers.Contract(TON_ADDRESS, TON_ABI, provider);
  const wtonContract = new ethers.Contract(WTON_ADDRESS, WTON_ABI, provider);
  const depositManager = new ethers.Contract(DEPOSIT_MANAGER_ADDRESS, DEPOSIT_MANAGER_ABI, provider);

  // Find matching private keys for participants
  const participantWallets: Array<{
    address: string;
    wallet: ethers.Wallet;
    tonMptKey: string;
    wtonMptKey: string;
    name: string;
  }> = [];

  for (let i = 0; i < PARTICIPANT_ADDRESSES.length; i++) {
    const participantAddress = PARTICIPANT_ADDRESSES[i];
    const tonMptKey = TON_MPT_KEYS[i];
    const wtonMptKey = WTON_MPT_KEYS[i];

    // Try to find matching private key
    let matchedWallet: ethers.Wallet | null = null;
    let matchedName = PARTICIPANT_NAMES[i];

    for (let j = 0; j < PRIVATE_KEYS.length; j++) {
      if (PRIVATE_KEYS[j]) {
        const wallet = new ethers.Wallet(PRIVATE_KEYS[j]!, provider);
        const walletAddress = await wallet.getAddress();
        if (walletAddress.toLowerCase() === participantAddress.toLowerCase()) {
          matchedWallet = wallet;
          matchedName = ['Alice', 'Bob', 'Charlie'][j] || matchedName;
          break;
        }
      }
    }

    if (matchedWallet) {
      participantWallets.push({
        address: participantAddress,
        wallet: matchedWallet,
        tonMptKey: tonMptKey,
        wtonMptKey: wtonMptKey,
        name: matchedName,
      });
    } else {
      console.log(`⚠️  No matching private key found for ${participantAddress}, skipping...`);
    }
  }

  if (participantWallets.length === 0) {
    console.error('❌ No matching wallets found! Please ensure private keys in .env match channel participants.');
    process.exit(1);
  }

  console.log(`\n✅ Found ${participantWallets.length} matching wallets to process\n`);

  // Process each account
  for (let i = 0; i < participantWallets.length; i++) {
    const { name, wallet, tonMptKey, wtonMptKey, address } = participantWallets[i];

    console.log(`\n${'='.repeat(80)}`);
    console.log(`👤 Processing ${name} (Account ${i + 1}/${participantWallets.length})`);
    console.log('='.repeat(80));
    console.log(`   Address: ${address}`);
    console.log(`   TON MPT Key: ${tonMptKey}`);
    console.log(`   WTON MPT Key: ${wtonMptKey}`);

    try {
      // Check ETH balance
      const ethBalance = await provider.getBalance(address);
      console.log(`   ETH Balance: ${ethers.formatEther(ethBalance)} ETH`);

      if (ethBalance < parseEther('0.001')) {
        console.log(`   ⚠️  Low ETH balance! Need at least 0.001 ETH for gas`);
        console.log(`   Skipping ${name}...\n`);
        continue;
      }

      // Check TON balance
      const tonWithSigner = tonContract.connect(wallet) as any;
      let tonBalance: bigint;
      try {
        tonBalance = await tonWithSigner.balanceOf(address);
        console.log(`   💰 TON Balance: ${ethers.formatEther(tonBalance)} TON`);
      } catch (error: any) {
        console.error(`   ❌ Error checking TON balance: ${error.message}`);
        console.error(`   ⚠️  TON contract at ${TON_ADDRESS} may not exist or may not implement balanceOf`);
        console.log(`   Skipping ${name}...\n`);
        continue;
      }

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
      const wtonWithSigner = wtonContract.connect(wallet) as any;
      const swapTx = await wtonWithSigner.swapFromTON(TON_AMOUNT);
      await waitForTx(swapTx, 'Swap TON->WTON');

      // Check WTON balance (WTON uses ray, not wei!)
      const wtonBalance = await wtonWithSigner.balanceOf(address);
      console.log(`   💰 WTON Balance: ${formatRay(wtonBalance)} WTON (ray units)`);

      // Step 2a: Approve TON to Deposit Manager (TON uses wei)
      console.log(`\n   📝 Step 2a: Approving ${ethers.formatEther(TON_DEPOSIT_AMOUNT)} TON to Deposit Manager...`);
      const tonApproveDepositTx = await tonWithSigner.approve(DEPOSIT_MANAGER_ADDRESS, TON_DEPOSIT_AMOUNT);
      await waitForTx(tonApproveDepositTx, 'Approve TON to Deposit Manager');

      // Step 2b: Approve WTON to Deposit Manager (WTON uses ray)
      console.log(`\n   📝 Step 2b: Approving ${formatRay(WTON_AMOUNT)} WTON to Deposit Manager...`);
      const wtonApproveTx = await wtonWithSigner.approve(DEPOSIT_MANAGER_ADDRESS, WTON_AMOUNT);
      await waitForTx(wtonApproveTx, 'Approve WTON');

      // Wait a bit for blockchain to sync
      await sleep(2000);

      // Step 3a: Deposit TON to Channel (TON uses wei)
      console.log(
        `\n   📝 Step 3a: Depositing ${ethers.formatEther(TON_DEPOSIT_AMOUNT)} TON to Channel ${CHANNEL_ID}...`,
      );
      const depositManagerWithSigner = depositManager.connect(wallet) as any;

      const tonDepositTx = await depositManagerWithSigner.depositToken(
        CHANNEL_ID,
        TON_ADDRESS,
        TON_DEPOSIT_AMOUNT,
        tonMptKey,
      );
      await waitForTx(tonDepositTx, 'Deposit TON');
      console.log(`   📝 TON Deposit Tx: https://sepolia.etherscan.io/tx/${tonDepositTx.hash}`);

      // Wait a bit between deposits
      await sleep(2000);

      // Step 3b: Deposit WTON to Channel (WTON uses ray)
      console.log(`\n   📝 Step 3b: Depositing ${formatRay(WTON_AMOUNT)} WTON to Channel ${CHANNEL_ID}...`);
      const wtonDepositTx = await depositManagerWithSigner.depositToken(
        CHANNEL_ID,
        WTON_ADDRESS,
        WTON_AMOUNT,
        wtonMptKey,
      );
      await waitForTx(wtonDepositTx, 'Deposit WTON');
      console.log(`   📝 WTON Deposit Tx: https://sepolia.etherscan.io/tx/${wtonDepositTx.hash}`);

      // Wait a bit for blockchain to sync before checking
      await sleep(3000);

      // Verify deposits for this participant immediately after deposit
      console.log(`\n   🔍 Verifying deposits for ${name}...`);
      const currentTonDeposit = await bridgeContract.getParticipantTokenDeposit(CHANNEL_ID, address, TON_ADDRESS);
      const currentWtonDeposit = await bridgeContract.getParticipantTokenDeposit(CHANNEL_ID, address, WTON_ADDRESS);
      const before = beforeDeposits.get(address) || { ton: 0n, wton: 0n };

      console.log(`   📊 TON Deposit:`);
      console.log(`      Before: ${ethers.formatEther(before.ton)} TON`);
      console.log(`      After:  ${ethers.formatEther(currentTonDeposit)} TON`);
      console.log(`      Change: ${ethers.formatEther(currentTonDeposit - before.ton)} TON`);

      const wtonBeforeWTON = before.wton / BigInt(10 ** 18);
      const wtonBeforeRAY = before.wton / BigInt(10 ** 27);
      const wtonAfterWTON = currentWtonDeposit / BigInt(10 ** 18);
      const wtonAfterRAY = currentWtonDeposit / BigInt(10 ** 27);
      const wtonDiff = currentWtonDeposit - before.wton;
      const wtonDiffWTON = wtonDiff / BigInt(10 ** 18);
      const wtonDiffRAY = wtonDiff / BigInt(10 ** 27);

      console.log(`   📊 WTON Deposit:`);
      console.log(
        `      Before: ${before.wton.toString()} wei (${wtonBeforeWTON.toString()} WTON, ${wtonBeforeRAY.toString()} RAY)`,
      );
      console.log(
        `      After:  ${currentWtonDeposit.toString()} wei (${wtonAfterWTON.toString()} WTON, ${wtonAfterRAY.toString()} RAY)`,
      );
      console.log(
        `      Change: ${wtonDiff.toString()} wei (${wtonDiffWTON.toString()} WTON, ${wtonDiffRAY.toString()} RAY)`,
      );

      console.log(`\n   ✅ ${name} completed successfully!`);

      // Wait between accounts to avoid nonce issues
      if (i < participantWallets.length - 1) {
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

  // Wait a bit for blockchain to sync
  console.log('\n⏸️  Waiting 10 seconds for blockchain to sync...');
  await sleep(10000);

  // Final verification of all deposits
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         Final On-Chain Deposit Balance Verification        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  await verifyDeposits(provider, beforeDeposits);

  // Additional detailed check
  console.log('\n📋 Detailed On-Chain Deposit Summary:\n');

  for (let i = 0; i < PARTICIPANT_ADDRESSES.length; i++) {
    const address = PARTICIPANT_ADDRESSES[i];
    const tonDeposit = await bridgeContract.getParticipantTokenDeposit(CHANNEL_ID, address, TON_ADDRESS);
    const wtonDeposit = await bridgeContract.getParticipantTokenDeposit(CHANNEL_ID, address, WTON_ADDRESS);

    console.log(`👤 ${PARTICIPANT_NAMES[i]} (${address}):`);
    console.log(`   TON Deposit:  ${tonDeposit.toString()} wei (${ethers.formatEther(tonDeposit)} TON)`);
    const wtonWTON = wtonDeposit / BigInt(10 ** 18);
    const wtonRAY = wtonDeposit / BigInt(10 ** 27);
    console.log(
      `   WTON Deposit: ${wtonDeposit.toString()} wei (${wtonWTON.toString()} WTON, ${wtonRAY.toString()} RAY)`,
    );
    console.log('');
  }

  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Process Complete!                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('📊 Summary:');
  console.log(`   Channel ID: ${CHANNEL_ID}`);
  console.log(`   TON Address: ${TON_ADDRESS}`);
  console.log(`   WTON Address: ${WTON_ADDRESS}`);
  console.log(`   TON Deposit Amount: ${ethers.formatEther(TON_DEPOSIT_AMOUNT)} TON per account (wei units)`);
  console.log(`   WTON Deposit Amount: ${formatRay(WTON_AMOUNT)} WTON per account (ray units)`);
  console.log(`   Participants Processed: ${participantWallets.length}`);
  console.log('');
  console.log('💡 Important Note:');
  console.log('   - TON uses wei units (10^18)');
  console.log('   - WTON uses ray units (10^27)');
  console.log('   - 1 TON (wei) = 1 WTON (ray), but ray is 10^9 times larger numerically');
  console.log('');
  console.log('🔍 Next Steps:');
  console.log(`   1. Verify channel state: getChannelState(${CHANNEL_ID}) should be 2 (Open)`);
  console.log('   2. Run: tsx examples/L2StateChannel/test-token-balances.ts');
  console.log('');
}

// Run the script
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
