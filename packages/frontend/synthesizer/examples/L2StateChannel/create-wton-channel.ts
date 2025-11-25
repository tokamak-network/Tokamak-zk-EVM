/**
 * Create WTON Channel Script
 *
 * This script creates a new state channel with WTON as the allowed token.
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
const ROLLUP_BRIDGE_PROXY = '0x780ad1b236390C42479b62F066F5cEeAa4c77ad6';
const WTON_ADDRESS = '0x79E0d92670106c85E9067b56B8F674340dCa0Bbd';

// Bob's private key (channel creator)
const BOB_PRIVATE_KEY = process.env.BOB_PRIVATE_KEY;

if (!BOB_PRIVATE_KEY) {
  console.error('❌ Error: BOB_PRIVATE_KEY not found in .env file');
  process.exit(1);
}

// Participants
const ALICE = '0xF9Fa94D45C49e879E46Ea783fc133F41709f3bc7';
const BOB = '0x322acfaA747F3CE5b5899611034FB4433f0Edf34';
const CHARLIE = '0x31Fbd690BF62cd8C60A93F3aD8E96A6085Dc5647';

// ============================================================================
// ABIs
// ============================================================================

const ROLLUP_BRIDGE_ABI = [
  `function openChannel(
    tuple(
      address[] allowedTokens,
      address[] participants,
      uint256 timeout,
      uint256 publicKeyX,
      uint256 publicKeyY
    ) params
  ) payable returns (uint256 channelId)`,
];

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║       Create WTON Channel 2 - Script (Bob as Leader)       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Initialize provider and wallet
  const provider = new JsonRpcProvider(SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(BOB_PRIVATE_KEY, provider);

  console.log('🌐 Connected to Sepolia RPC');
  console.log(`👤 Channel Creator: ${wallet.address}\n`);

  // Initialize RollupBridge contract
  const rollupBridge = new ethers.Contract(ROLLUP_BRIDGE_PROXY, ROLLUP_BRIDGE_ABI, wallet);

  // Channel parameters
  const channelParams = {
    allowedTokens: [WTON_ADDRESS],
    participants: [ALICE, BOB, CHARLIE],
    timeout: 604800, // 7 days
    publicKeyX: 1,
    publicKeyY: 2,
  };

  console.log('📋 Channel Parameters:');
  console.log(`   Allowed Tokens: ${channelParams.allowedTokens.join(', ')}`);
  console.log(`   Participants: ${channelParams.participants.length}`);
  console.log(`     - Alice: ${ALICE}`);
  console.log(`     - Bob: ${BOB}`);
  console.log(`     - Charlie: ${CHARLIE}`);
  console.log(`   Timeout: ${channelParams.timeout} seconds (7 days)`);
  console.log(`   Public Key: (${channelParams.publicKeyX}, ${channelParams.publicKeyY})\n`);

  // Check ETH balance
  const ethBalance = await provider.getBalance(wallet.address);
  console.log(`💰 ETH Balance: ${ethers.formatEther(ethBalance)} ETH`);

  if (ethBalance < parseEther('0.01')) {
    console.error('❌ Insufficient ETH for gas + bond (0.001 ETH)');
    process.exit(1);
  }

  try {
    console.log('\n📝 Creating channel...');

    // Call openChannel with 0.001 ETH bond
    const tx = await rollupBridge.openChannel(channelParams, {
      value: parseEther('0.001'),
    });

    console.log(`⏳ Transaction sent: ${tx.hash}`);
    console.log(`🔗 Etherscan: https://sepolia.etherscan.io/tx/${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed! Gas used: ${receipt.gasUsed.toString()}`);

    // Parse logs to get channel ID
    const channelOpenedEvent = receipt.logs.find((log: any) => {
      try {
        const parsed = rollupBridge.interface.parseLog(log);
        return parsed?.name === 'ChannelOpened';
      } catch {
        return false;
      }
    });

    if (channelOpenedEvent) {
      const parsed = rollupBridge.interface.parseLog(channelOpenedEvent);
      const channelId = parsed?.args?.channelId?.toString();
      console.log(`\n🎉 Channel Created Successfully!`);
      console.log(`📌 Channel ID: ${channelId}`);
      console.log(`\n✨ Next Step: Update CHANNEL_ID in deposit-wton.ts to ${channelId}`);
    } else {
      console.log('\n✅ Channel created (Channel ID extraction failed, check Etherscan logs)');
    }
  } catch (error: any) {
    console.error('\n❌ Error creating channel:', error.message);
    if (error.data) {
      console.error('Error data:', error.data);
    }
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
