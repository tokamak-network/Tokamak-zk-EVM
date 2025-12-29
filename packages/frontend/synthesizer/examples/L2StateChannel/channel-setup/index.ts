/**
 * State Channel Setup Script (Interactive)
 *
 * This script automates the complete flow of setting up a state channel:
 * 1. Interactive configuration via prompts
 * 2. Open a new channel with all participants
 * 3. Each participant deposits tokens to the channel
 * 4. Leader initializes the channel state
 *
 * Environment Variables (optional - used as defaults):
 * - CHANNEL_LEADER_PRIVATE_KEY: Leader's private key
 * - CHANNEL_PARTICIPANT_PRIVATE_KEYS: JSON array of participant private keys
 * - SEPOLIA_RPC_URL: Sepolia RPC URL
 *
 * Usage:
 *   npx tsx examples/L2StateChannel/channel-setup/index.ts
 */

import inquirer from 'inquirer';
import { ethers, parseEther } from 'ethers';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync } from 'fs';
import {
  DEPOSIT_MANAGER_PROXY_ADDRESS,
  ROLLUP_BRIDGE_CORE_ADDRESS,
  ROLLUP_BRIDGE_CORE_ABI,
} from '../../../src/interface/adapters/constants/index.ts';
import { SEPOLIA_RPC_URL, TON_ADDRESS, TON_ABI, DEPOSIT_MANAGER_ABI } from '../constants/index.ts';
import {
  L2_PRV_KEY_MESSAGE,
  deriveL2KeysFromSignature,
  deriveL2AddressFromKeys,
  deriveL2MptKeyFromAddress,
} from '../../../src/TokamakL2JS/utils/web.ts';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from synthesizer root
const envPath = resolve(__dirname, '../../../.env');
config({ path: envPath });

// Output directory for state info
const OUTPUT_DIR = resolve(__dirname, '../../test-outputs/channel-state');

// ERC20 ABI for token symbol query
const ERC20_SYMBOL_ABI = [
  'function symbol() view returns (string)',
];

// ============================================================================
// TYPES
// ============================================================================

interface ChannelConfig {
  leaderPrivateKey: string;
  participantPrivateKeys: string[];
  participantNames: string[];
  targetContract: string;
  targetTokenSymbol: string;  // Token symbol (e.g., "TON")
  depositAmounts: bigint[];  // Individual deposit amount for each participant
}

// ============================================================================
// INTERACTIVE CONFIGURATION
// ============================================================================

function maskPrivateKey(pk: string): string {
  if (!pk || pk.length < 10) return '(not set)';
  return `${pk.slice(0, 6)}...${pk.slice(-4)}`;
}

function getAddressFromPrivateKey(pk: string): string {
  try {
    const wallet = new ethers.Wallet(pk);
    return wallet.address;
  } catch {
    return '(invalid key)';
  }
}

async function getTokenSymbol(tokenAddress: string): Promise<string> {
  try {
    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_SYMBOL_ABI, provider);
    const symbol = await tokenContract.symbol();
    return symbol;
  } catch {
    return 'UNKNOWN';
  }
}

async function getInteractiveConfig(): Promise<ChannelConfig> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              State Channel Setup (Interactive)                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Get env defaults
  const envLeaderPk = process.env.CHANNEL_LEADER_PRIVATE_KEY || '';
  const envParticipantPks = process.env.CHANNEL_PARTICIPANT_PRIVATE_KEYS || '';

  let parsedEnvParticipantPks: string[] = [];

  try {
    if (envParticipantPks) parsedEnvParticipantPks = JSON.parse(envParticipantPks);
  } catch { /* ignore */ }

  // ========================================================================
  // Step 1: Leader Private Key
  // ========================================================================
  console.log('📋 Step 1: Leader Configuration\n');

  let leaderPrivateKey = envLeaderPk;

  if (envLeaderPk) {
    const leaderAddress = getAddressFromPrivateKey(envLeaderPk);
    const { useEnvLeader } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useEnvLeader',
        message: `Use leader from .env? ${maskPrivateKey(envLeaderPk)} (${leaderAddress})`,
        default: true,
      },
    ]);

    if (!useEnvLeader) {
      const { manualLeaderPk } = await inquirer.prompt([
        {
          type: 'password',
          name: 'manualLeaderPk',
          message: 'Enter leader private key:',
          mask: '*',
          validate: (input) => {
            if (!input || input.length < 64) return 'Invalid private key';
            try {
              new ethers.Wallet(input);
              return true;
            } catch {
              return 'Invalid private key format';
            }
          },
        },
      ]);
      leaderPrivateKey = manualLeaderPk;
    }
  } else {
    const { manualLeaderPk } = await inquirer.prompt([
      {
        type: 'password',
        name: 'manualLeaderPk',
        message: 'Enter leader private key (not found in .env):',
        mask: '*',
        validate: (input) => {
          if (!input || input.length < 64) return 'Invalid private key';
          try {
            new ethers.Wallet(input);
            return true;
          } catch {
            return 'Invalid private key format';
          }
        },
      },
    ]);
    leaderPrivateKey = manualLeaderPk;
  }

  // ========================================================================
  // Step 2: Participant Private Keys
  // ========================================================================
  console.log('\n📋 Step 2: Participant Configuration\n');

  let participantPrivateKeys: string[] = parsedEnvParticipantPks;

  if (parsedEnvParticipantPks.length > 0) {
    console.log('   Found participants in .env:');
    parsedEnvParticipantPks.forEach((pk, i) => {
      const addr = getAddressFromPrivateKey(pk);
      console.log(`   ${i + 1}. Participant ${i + 2}: ${maskPrivateKey(pk)} (${addr})`);
    });
    console.log('');

    const { useEnvParticipants } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useEnvParticipants',
        message: 'Use participants from .env?',
        default: true,
      },
    ]);

    if (!useEnvParticipants) {
      participantPrivateKeys = await inputParticipants();
    }
  } else {
    console.log('   No participants found in .env');
    participantPrivateKeys = await inputParticipants();
  }

  // Generate default participant names
  const totalParticipants = 1 + participantPrivateKeys.length;
  const participantNames = ['Leader'];
  for (let i = 1; i < totalParticipants; i++) {
    participantNames.push(`Participant ${i + 1}`);
  }

  // ========================================================================
  // Step 3: Channel Settings
  // ========================================================================
  console.log('\n📋 Step 3: Channel Settings\n');

  // Get default token symbol
  const defaultTokenSymbol = await getTokenSymbol(TON_ADDRESS!);
  console.log(`   Default token: ${TON_ADDRESS} (${defaultTokenSymbol})\n`);

  const { targetContract } = await inquirer.prompt([
    {
      type: 'input',
      name: 'targetContract',
      message: `Target contract address (default: ${defaultTokenSymbol}):`,
      default: TON_ADDRESS,
      validate: (input) => ethers.isAddress(input) || 'Invalid address',
    },
  ]);

  // Get selected token symbol
  const selectedTokenSymbol = targetContract === TON_ADDRESS 
    ? defaultTokenSymbol 
    : await getTokenSymbol(targetContract);
  console.log(`   Selected token: ${targetContract} (${selectedTokenSymbol})`);

  // ========================================================================
  // Step 4: Deposit Amounts
  // ========================================================================
  console.log('\n📋 Step 4: Deposit Amounts\n');

  const { useSameAmount } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'useSameAmount',
      message: 'Use the same deposit amount for all participants?',
      default: true,
    },
  ]);

  const depositAmounts: bigint[] = [];

  if (useSameAmount) {
    const { amount } = await inquirer.prompt([
      {
        type: 'input',
        name: 'amount',
        message: 'Deposit amount for all participants (in token units):',
        default: '10',
        validate: (input) => !isNaN(parseFloat(input)) || 'Must be a number',
      },
    ]);
    const amountBigInt = parseEther(amount);
    for (let i = 0; i < totalParticipants; i++) {
      depositAmounts.push(amountBigInt);
    }
  } else {
    for (let i = 0; i < totalParticipants; i++) {
      const name = participantNames[i];
      const { amount } = await inquirer.prompt([
        {
          type: 'input',
          name: 'amount',
          message: `Deposit amount for ${name} (in token units):`,
          default: '10',
          validate: (input) => !isNaN(parseFloat(input)) || 'Must be a number',
        },
      ]);
      depositAmounts.push(parseEther(amount));
    }
  }

  // ========================================================================
  // Confirmation
  // ========================================================================
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Configuration Summary');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const leaderWallet = new ethers.Wallet(leaderPrivateKey);
  console.log(`   Leader: ${participantNames[0]} (${leaderWallet.address}) - ${ethers.formatEther(depositAmounts[0])} ${selectedTokenSymbol}`);
  participantPrivateKeys.forEach((pk, i) => {
    const wallet = new ethers.Wallet(pk);
    console.log(`   Participant ${i + 2}: ${participantNames[i + 1]} (${wallet.address}) - ${ethers.formatEther(depositAmounts[i + 1])} ${selectedTokenSymbol}`);
  });
  console.log(`   Target Contract: ${targetContract} (${selectedTokenSymbol})`);
  console.log(`   Total Deposit: ${ethers.formatEther(depositAmounts.reduce((a, b) => a + b, 0n))} ${selectedTokenSymbol}\n`);

  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: 'Proceed with this configuration?',
      default: true,
    },
  ]);

  if (!confirmed) {
    console.log('\n❌ Setup cancelled by user');
    process.exit(0);
  }

  return {
    leaderPrivateKey,
    participantPrivateKeys,
    participantNames,
    targetContract,
    targetTokenSymbol: selectedTokenSymbol,
    depositAmounts,
  };
}

async function inputParticipants(): Promise<string[]> {
  const { count } = await inquirer.prompt([
    {
      type: 'number',
      name: 'count',
      message: 'Number of participants (excluding leader):',
      default: 2,
      validate: (input) => (input !== undefined && input >= 1) || 'Must have at least 1 participant',
    },
  ]);

  const participantKeys: string[] = [];
  for (let i = 0; i < count; i++) {
    const { pk } = await inquirer.prompt([
      {
        type: 'password',
        name: 'pk',
        message: `Enter private key for participant ${i + 2}:`,
        mask: '*',
        validate: (input) => {
          if (!input || input.length < 64) return 'Invalid private key';
          try {
            new ethers.Wallet(input);
            return true;
          } catch {
            return 'Invalid private key format';
          }
        },
      },
    ]);
    participantKeys.push(pk);
  }

  return participantKeys;
}

// ============================================================================
// MPT KEY GENERATION
// ============================================================================

interface MptKeyResult {
  mptKey: string;
  l2Address: string;
  message: string;
}

async function generateMptKey(wallet: ethers.Wallet, channelId: number, slot: number = 0): Promise<MptKeyResult> {
  // channelId should be in decimal format to match the page's MetaMask signature
  const message = `${L2_PRV_KEY_MESSAGE}${channelId}`;
  const signature = (await wallet.signMessage(message)) as `0x${string}`;
  const l2Keys = deriveL2KeysFromSignature(signature);
  const l2Address = deriveL2AddressFromKeys(l2Keys);
  const mptKey = deriveL2MptKeyFromAddress(l2Address, slot);
  return { mptKey, l2Address, message };
}

// ============================================================================
// MAIN SCRIPT
// ============================================================================

async function setupStateChannel() {
  // Get interactive configuration
  const channelConfig = await getInteractiveConfig();
  
  // Debug: Print configuration
  console.log('\n🔍 Debug Info:');
  console.log(`   RPC URL: ${SEPOLIA_RPC_URL}`);
  console.log(`   Bridge Contract: ${ROLLUP_BRIDGE_CORE_ADDRESS}`);
  console.log(`   Deposit Manager: ${DEPOSIT_MANAGER_PROXY_ADDRESS}`);
  console.log(`   Target Contract: ${channelConfig.targetContract} (${channelConfig.targetTokenSymbol})\n`);
  
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  
  // Verify network connection
  try {
    const network = await provider.getNetwork();
    console.log(`   ✅ Connected to network: ${network.name} (chainId: ${network.chainId})\n`);
  } catch (e) {
    console.log(`   ❌ Failed to connect to network: ${e}\n`);
    throw e;
  }

  // Create wallets for all participants
  const leaderWallet = new ethers.Wallet(channelConfig.leaderPrivateKey, provider);
  const participantWallets = channelConfig.participantPrivateKeys.map(pk => new ethers.Wallet(pk, provider));
  const allWallets = [leaderWallet, ...participantWallets];

  console.log('\n');

  // ========================================================================
  // Step 1: Open Channel
  // ========================================================================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Step 1: Opening Channel');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const bridgeContract = new ethers.Contract(ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, leaderWallet);

  // Debug: Check if contract has code
  const code = await provider.getCode(ROLLUP_BRIDGE_CORE_ADDRESS);
  console.log(`   Contract code exists: ${code !== '0x' ? 'Yes (' + code.length + ' bytes)' : 'No'}`);

  // Get all participant addresses
  const participantAddresses = allWallets.map(w => w.address);

  // Open channel
  console.log(`   Opening channel with ${participantAddresses.length} participants...`);

  const openChannelParams = {
    targetContract: channelConfig.targetContract,
    participants: participantAddresses,
    enableFrostSignature: false,  // Disabled for synthesizer testing
  };

  const openTx = await bridgeContract.openChannel(openChannelParams);
  console.log(`   Transaction sent: ${openTx.hash}`);

  const openReceipt = await openTx.wait();
  console.log(`   Transaction confirmed in block ${openReceipt.blockNumber}`);

  // Get channel ID from ChannelOpened event
  const channelOpenedTopic = ethers.id('ChannelOpened(uint256,address)');
  const channelOpenedEvent = openReceipt.logs.find((log: any) => log.topics[0] === channelOpenedTopic);

  if (!channelOpenedEvent) {
    throw new Error('ChannelOpened event not found');
  }

  const channelId = parseInt(channelOpenedEvent.topics[1], 16);
  console.log(`   ✅ Channel opened successfully!`);
  console.log(`   📍 Channel ID: ${channelId}\n`);

  // ========================================================================
  // Step 2: Deposit Tokens
  // ========================================================================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Step 2: Depositing Tokens');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const depositManagerContract = new ethers.Contract(DEPOSIT_MANAGER_PROXY_ADDRESS, DEPOSIT_MANAGER_ABI, provider);
  const tonContract = new ethers.Contract(channelConfig.targetContract, TON_ABI, provider);

  for (let i = 0; i < allWallets.length; i++) {
    const wallet = allWallets[i];
    const name = channelConfig.participantNames[i];
    const depositAmount = channelConfig.depositAmounts[i];

    console.log(`   ${i + 1}. ${name} (${wallet.address}):`);

    // Generate MPT key
    const { mptKey, l2Address, message } = await generateMptKey(wallet, channelId, 0);
    console.log(`      Signed Message: "${message}"`);
    console.log(`      L2 Address: ${l2Address}`);
    console.log(`      MPT Key: ${mptKey}`);

    // Check token balance
    const balance = await tonContract.balanceOf(wallet.address);
    console.log(`      Token Balance: ${ethers.formatEther(balance)}`);

    if (balance < depositAmount) {
      console.log(`      ❌ Insufficient balance! Need ${ethers.formatEther(depositAmount)}`);
      continue;
    }

    // Approve tokens
    console.log(`      Approving ${ethers.formatEther(depositAmount)} ${channelConfig.targetTokenSymbol}...`);
    const tokenWithSigner = tonContract.connect(wallet) as ethers.Contract;
    const approveTx = await tokenWithSigner.approve(DEPOSIT_MANAGER_PROXY_ADDRESS, depositAmount);
    await approveTx.wait();
    console.log(`      ✅ Approved`);

    // Deposit
    console.log(`      Depositing...`);
    const depositManagerWithSigner = depositManagerContract.connect(wallet) as ethers.Contract;
    const depositTx = await depositManagerWithSigner.depositToken(channelId, depositAmount, mptKey);
    const depositReceipt = await depositTx.wait();
    console.log(`      ✅ Deposited in block ${depositReceipt.blockNumber}\n`);
  }

  // ========================================================================
  // Step 3: Channel State Info
  // ========================================================================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Step 3: Channel State');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Note: setChannelPublicKey is skipped because enableFrostSignature is false
  // For synthesizer testing, frost signature is not required
  console.log(`   ℹ️  Frost signature disabled - skipping public key setup`);
  console.log(`   📝 Channel state initialization will be done separately\n`);

  // ========================================================================
  // Save Channel Info
  // ========================================================================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Saving Channel Information');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Get channel info
  const [targetAddress, state, participantCount, initialRoot] = await bridgeContract.getChannelInfo(channelId);
  const participants = await bridgeContract.getChannelParticipants(channelId);

  // Get deposit info for each participant
  const deposits = [];
  for (let i = 0; i < participants.length; i++) {
    const deposit = await bridgeContract.getParticipantDeposit(channelId, participants[i]);
    const mptKey = await bridgeContract.getL2MptKey(channelId, participants[i]);
    deposits.push({
      address: participants[i],
      name: channelConfig.participantNames[i],
      deposit: deposit.toString(),
      mptKey: '0x' + mptKey.toString(16).padStart(64, '0'),
    });
  }

  const channelInfo = {
    channelId,
    targetContract: targetAddress,
    state: state.toString(),
    participantCount: participantCount.toString(),
    initialRoot,
    participants: deposits,
    createdAt: new Date().toISOString(),
  };

  // Save to file
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = resolve(OUTPUT_DIR, `channel_${channelId}_info.json`);
  writeFileSync(outputPath, JSON.stringify(channelInfo, null, 2), 'utf-8');

  console.log(`   ✅ Channel info saved to: ${outputPath}\n`);

  // ========================================================================
  // Final Summary
  // ========================================================================
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Setup Complete!                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('📊 Channel Summary:');
  console.log(`   - Channel ID: ${channelId}`);
  console.log(`   - Target Contract: ${targetAddress} (${channelConfig.targetTokenSymbol})`);
  console.log(`   - Participants: ${participantCount}`);
  console.log(`   - State: ${state}\n`);

  console.log('👥 Participant Deposits:');
  for (const deposit of deposits) {
    console.log(`   - ${deposit.name}: ${ethers.formatEther(deposit.deposit)} ${channelConfig.targetTokenSymbol}`);
  }
  console.log('');

  console.log('📝 Next Steps:');
  console.log(`   1. Run initializeChannelState on ProofManager contract`);
  console.log(`   2. Run initialize-statechannel.ts to verify state restoration`);
  console.log(`   3. Use the channel for L2 transactions\n`);

  return channelId;
}

// ============================================================================
// RUN SCRIPT
// ============================================================================

setupStateChannel()
  .then(channelId => {
    console.log(`🎉 Channel ${channelId} setup completed successfully!`);
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Setup failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  });
