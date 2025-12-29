/**
 * L2 State Channel End-to-End Test
 *
 * This is a comprehensive test that covers the complete flow:
 * 1. Channel Setup (Open channel, Deposit tokens)
 * 2. Initialize Channel State (Call initializeChannelState on ProofManager)
 * 3. L2 Transfer Simulation (Using SynthesizerAdapter)
 * 4. Proof Generation and Verification
 *
 * Usage:
 *   npx tsx examples/L2StateChannel/index.ts
 *
 * Environment Variables:
 *   - CHANNEL_LEADER_PRIVATE_KEY: Leader's private key
 *   - CHANNEL_PARTICIPANT_PRIVATE_KEYS: JSON array of participant private keys
 *   - SEPOLIA_RPC_URL: Sepolia RPC URL
 *   - CHANNEL_ID: (Optional) Existing channel ID to use instead of creating new
 *   - INITIALIZE_TX_HASH: (Optional) Initialize tx hash for existing channel
 */

import inquirer from 'inquirer';
import { ethers, parseEther } from 'ethers';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import {
  DEPOSIT_MANAGER_PROXY_ADDRESS,
  ROLLUP_BRIDGE_CORE_ADDRESS,
  ROLLUP_BRIDGE_CORE_ABI,
  ROLLUP_BRIDGE_PROOF_MANAGER_ADDRESS,
} from '../../src/interface/adapters/constants/index.ts';
import { SEPOLIA_RPC_URL, TON_ADDRESS, TON_ABI, DEPOSIT_MANAGER_ABI } from './constants/index.ts';
import {
  L2_PRV_KEY_MESSAGE,
  deriveL2KeysFromSignature,
  deriveL2AddressFromKeys,
  deriveL2MptKeyFromAddress,
} from '../../src/TokamakL2JS/utils/web.ts';
import { SynthesizerAdapter } from '../../src/interface/adapters/synthesizerAdapter.ts';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from synthesizer root
const envPath = resolve(__dirname, '../../.env');
config({ path: envPath });

// Project and binary paths
// __dirname: packages/frontend/synthesizer/examples/L2StateChannel/
// tokamak-zk-evm root: ../../../../../
const projectRoot = resolve(__dirname, '../../../../../');
const distBinPath = resolve(projectRoot, 'dist/bin');
const preprocessBinary = `${distBinPath}/preprocess`;
const proverBinary = `${distBinPath}/prove`;
const verifyBinary = `${distBinPath}/verify`;

// Output directory base (will be appended with channelId)
const OUTPUT_BASE = resolve(__dirname, 'output');

// ProofManager ABI (minimal for initializeChannelState)
const PROOF_MANAGER_ABI = [
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'initializeChannelState',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'channelId', type: 'uint256' },
      { indexed: false, name: 'currentStateRoot', type: 'bytes32' },
    ],
    name: 'StateInitialized',
    type: 'event',
  },
];

// ERC20 ABI for token symbol
const ERC20_SYMBOL_ABI = ['function symbol() view returns (string)'];

// ============================================================================
// TYPES
// ============================================================================

interface ChannelConfig {
  leaderPrivateKey: string;
  participantPrivateKeys: string[];
  participantNames: string[];
  targetContract: string;
  targetTokenSymbol: string;
  depositAmounts: bigint[];
}

interface L2KeyInfo {
  l2PrivateKey: Uint8Array;
  l2Address: string;
  mptKey: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function maskPrivateKey(pk: string): string {
  if (!pk || pk.length < 10) return '(not set)';
  return `${pk.slice(0, 6)}...${pk.slice(-4)}`;
}

function getAddressFromPrivateKey(pk: string): string {
  try {
    return new ethers.Wallet(pk).address;
  } catch {
    return '(invalid key)';
  }
}

async function getTokenSymbol(tokenAddress: string): Promise<string> {
  try {
    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_SYMBOL_ABI, provider);
    return await tokenContract.symbol();
  } catch {
    return 'UNKNOWN';
  }
}

async function generateL2Keys(wallet: ethers.Wallet, channelId: number): Promise<L2KeyInfo> {
  // Channel ID should be in decimal format to match the page's MetaMask signature
  const message = `${L2_PRV_KEY_MESSAGE}${channelId}`;
  const signature = (await wallet.signMessage(message)) as `0x${string}`;
  const l2Keys = deriveL2KeysFromSignature(signature);
  const l2Address = deriveL2AddressFromKeys(l2Keys);
  const mptKey = deriveL2MptKeyFromAddress(l2Address, 0);
  return {
    l2PrivateKey: l2Keys.privateKey,
    l2Address,
    mptKey,
  };
}

// ============================================================================
// BINARY RUNNERS
// ============================================================================

async function runPreprocess(outputsPath: string): Promise<boolean> {
  console.log(`\n⚙️  Running preprocess...`);

  const qapPath = resolve(projectRoot, 'packages/frontend/qap-compiler/subcircuits/library');
  const setupPath = resolve(projectRoot, 'dist/resource/setup/output');
  const preprocessOutPath = resolve(projectRoot, 'dist/resource/preprocess/output');

  if (!existsSync(preprocessBinary)) {
    console.error(`   ❌ Preprocess binary not found at ${preprocessBinary}`);
    return false;
  }

  if (!existsSync(preprocessOutPath)) {
    mkdirSync(preprocessOutPath, { recursive: true });
  }

  try {
    const cmd = `"${preprocessBinary}" "${qapPath}" "${outputsPath}" "${setupPath}" "${preprocessOutPath}"`;
    const startTime = Date.now();

    execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', timeout: 300000 });

    const duration = Date.now() - startTime;
    if (existsSync(`${preprocessOutPath}/preprocess.json`)) {
      console.log(`   ✅ Preprocess completed in ${(duration / 1000).toFixed(2)}s`);
      return true;
    }
    return false;
  } catch (error: any) {
    console.log(`   ❌ Preprocess error: ${error.message}`);
    return false;
  }
}

async function runProver(outputsPath: string): Promise<boolean> {
  console.log(`\n⚡ Running prover...`);

  const qapPath = resolve(projectRoot, 'packages/frontend/qap-compiler/subcircuits/library');
  const setupPath = resolve(projectRoot, 'dist/resource/setup/output');

  if (!existsSync(proverBinary)) {
    console.error(`   ❌ Prover binary not found at ${proverBinary}`);
    return false;
  }

  if (!existsSync(`${outputsPath}/instance.json`)) {
    console.log(`   ⚠️  instance.json not found`);
    return false;
  }

  try {
    const cmd = `"${proverBinary}" "${qapPath}" "${outputsPath}" "${setupPath}" "${outputsPath}"`;
    const startTime = Date.now();

    const output = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', timeout: 300000 });

    const duration = Date.now() - startTime;
    if (existsSync(`${outputsPath}/proof.json`)) {
      console.log(`   ✅ Proof generated in ${(duration / 1000).toFixed(2)}s`);
      const timeMatch = output.match(/Total proving time: ([\d.]+) seconds/);
      if (timeMatch) {
        console.log(`   ⏱️  Proving time: ${timeMatch[1]}s`);
      }
      return true;
    }
    return false;
  } catch (error: any) {
    console.log(`   ❌ Prover error: ${error.message}`);
    return false;
  }
}

async function runVerify(outputsPath: string): Promise<boolean> {
  console.log(`\n🔐 Running verification...`);

  const qapPath = resolve(projectRoot, 'packages/frontend/qap-compiler/subcircuits/library');
  const setupPath = resolve(projectRoot, 'dist/resource/setup/output');
  const preprocessPath = resolve(projectRoot, 'dist/resource/preprocess/output');

  if (!existsSync(verifyBinary)) {
    console.error(`   ❌ Verify binary not found at ${verifyBinary}`);
    return false;
  }

  if (!existsSync(`${outputsPath}/proof.json`)) {
    console.log(`   ⚠️  proof.json not found`);
    return false;
  }

  try {
    const cmd = `"${verifyBinary}" "${qapPath}" "${outputsPath}" "${setupPath}" "${preprocessPath}" "${outputsPath}"`;
    const startTime = Date.now();

    const output = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', timeout: 60000 });

    const duration = Date.now() - startTime;
    const lines = output.split('\n');
    const verificationResult = lines.find(line => line.trim() === 'true' || line.trim() === 'false');

    if (verificationResult === 'true') {
      console.log(`   ✅ Verification PASSED in ${(duration / 1000).toFixed(2)}s`);
      return true;
    } else {
      console.log(`   ❌ Verification FAILED`);
      return false;
    }
  } catch (error: any) {
    console.log(`   ❌ Verification error: ${error.message}`);
    return false;
  }
}

// ============================================================================
// INTERACTIVE CONFIGURATION
// ============================================================================

async function getInteractiveConfig(): Promise<{ config: ChannelConfig; useExisting: boolean; existingChannelId?: number; existingInitTxHash?: string }> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           L2 State Channel End-to-End Test                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Check for existing channel
  const envChannelId = process.env.CHANNEL_ID;
  const envInitTxHash = process.env.INITIALIZE_TX_HASH;

  let useExisting = false;
  let existingChannelId: number | undefined;
  let existingInitTxHash: string | undefined;

  if (envChannelId && envInitTxHash) {
    console.log(`   Found existing channel in .env:`);
    console.log(`   - Channel ID: ${envChannelId}`);
    console.log(`   - Initialize TX: ${envInitTxHash.slice(0, 20)}...`);
    console.log('');

    const { useEnvChannel } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useEnvChannel',
        message: 'Use existing channel from .env?',
        default: true,
      },
    ]);

    if (useEnvChannel) {
      useExisting = true;
      existingChannelId = parseInt(envChannelId);
      existingInitTxHash = envInitTxHash;
    }
  }

  // Get env defaults for private keys
  const envLeaderPk = process.env.CHANNEL_LEADER_PRIVATE_KEY || '';
  const envParticipantPks = process.env.CHANNEL_PARTICIPANT_PRIVATE_KEYS || '';
  let parsedEnvParticipantPks: string[] = [];
  try {
    if (envParticipantPks) parsedEnvParticipantPks = JSON.parse(envParticipantPks);
  } catch { /* ignore */ }

  // Step 1: Leader Private Key
  console.log('\n📋 Step 1: Leader Configuration\n');

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
            try {
              new ethers.Wallet(input);
              return true;
            } catch {
              return 'Invalid private key';
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
        message: 'Enter leader private key:',
        mask: '*',
        validate: (input) => {
          try {
            new ethers.Wallet(input);
            return true;
          } catch {
            return 'Invalid private key';
          }
        },
      },
    ]);
    leaderPrivateKey = manualLeaderPk;
  }

  // Step 2: Participant Private Keys
  console.log('\n📋 Step 2: Participant Configuration\n');

  let participantPrivateKeys: string[] = parsedEnvParticipantPks;
  if (parsedEnvParticipantPks.length > 0) {
    console.log('   Found participants in .env:');
    parsedEnvParticipantPks.forEach((pk, i) => {
      const addr = getAddressFromPrivateKey(pk);
      console.log(`   ${i + 1}. Participant ${i + 2}: ${maskPrivateKey(pk)} (${addr})`);
    });

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
    participantPrivateKeys = await inputParticipants();
  }

  const totalParticipants = 1 + participantPrivateKeys.length;
  const participantNames = ['Leader'];
  for (let i = 1; i < totalParticipants; i++) {
    participantNames.push(`Participant ${i + 1}`);
  }

  // For existing channels, we skip channel settings and deposit
  if (useExisting) {
    const defaultTokenSymbol = await getTokenSymbol(TON_ADDRESS!);
    return {
      config: {
        leaderPrivateKey,
        participantPrivateKeys,
        participantNames,
        targetContract: TON_ADDRESS!,
        targetTokenSymbol: defaultTokenSymbol,
        depositAmounts: [],
      },
      useExisting,
      existingChannelId,
      existingInitTxHash,
    };
  }

  // Step 3: Channel Settings (only for new channel)
  console.log('\n📋 Step 3: Channel Settings\n');

  const defaultTokenSymbol = await getTokenSymbol(TON_ADDRESS!);
  console.log(`   Default token: ${TON_ADDRESS} (${defaultTokenSymbol})\n`);

  const { targetContract } = await inquirer.prompt([
    {
      type: 'input',
      name: 'targetContract',
      message: `Target contract address:`,
      default: TON_ADDRESS,
      validate: (input) => ethers.isAddress(input) || 'Invalid address',
    },
  ]);

  const selectedTokenSymbol = targetContract === TON_ADDRESS
    ? defaultTokenSymbol
    : await getTokenSymbol(targetContract);

  // Step 4: Deposit Amounts
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
        message: `Deposit amount (in ${selectedTokenSymbol}):`,
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
      const { amount } = await inquirer.prompt([
        {
          type: 'input',
          name: 'amount',
          message: `Deposit for ${participantNames[i]} (in ${selectedTokenSymbol}):`,
          default: '10',
          validate: (input) => !isNaN(parseFloat(input)) || 'Must be a number',
        },
      ]);
      depositAmounts.push(parseEther(amount));
    }
  }

  return {
    config: {
      leaderPrivateKey,
      participantPrivateKeys,
      participantNames,
      targetContract,
      targetTokenSymbol: selectedTokenSymbol,
      depositAmounts,
    },
    useExisting: false,
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
        message: `Private key for participant ${i + 2}:`,
        mask: '*',
        validate: (input) => {
          try {
            new ethers.Wallet(input);
            return true;
          } catch {
            return 'Invalid private key';
          }
        },
      },
    ]);
    participantKeys.push(pk);
  }

  return participantKeys;
}

// ============================================================================
// PHASE 1: CHANNEL SETUP
// ============================================================================

async function setupChannel(
  channelConfig: ChannelConfig,
  provider: ethers.JsonRpcProvider,
  allWallets: ethers.Wallet[],
): Promise<number> {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('PHASE 1: Channel Setup');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const leaderWallet = allWallets[0];
  const bridgeContract = new ethers.Contract(ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, leaderWallet);

  // Step 1.1: Open Channel
  console.log('📌 Step 1.1: Opening Channel\n');

  const participantAddresses = allWallets.map(w => w.address);
  console.log(`   Participants: ${participantAddresses.length}`);

  const openChannelParams = {
    targetContract: channelConfig.targetContract,
    participants: participantAddresses,
    enableFrostSignature: false,
  };

  const openTx = await bridgeContract.openChannel(openChannelParams);
  console.log(`   TX: ${openTx.hash}`);

  const openReceipt = await openTx.wait();
  console.log(`   Block: ${openReceipt.blockNumber}`);

  const channelOpenedTopic = ethers.id('ChannelOpened(uint256,address)');
  const channelOpenedEvent = openReceipt.logs.find((log: any) => log.topics[0] === channelOpenedTopic);

  if (!channelOpenedEvent) {
    throw new Error('ChannelOpened event not found');
  }

  const channelId = parseInt(channelOpenedEvent.topics[1], 16);
  console.log(`   ✅ Channel ID: ${channelId}\n`);

  // Step 1.2: Deposit Tokens
  console.log('📌 Step 1.2: Depositing Tokens\n');

  const depositManagerContract = new ethers.Contract(DEPOSIT_MANAGER_PROXY_ADDRESS, DEPOSIT_MANAGER_ABI, provider);
  const tonContract = new ethers.Contract(channelConfig.targetContract, TON_ABI, provider);

  for (let i = 0; i < allWallets.length; i++) {
    const wallet = allWallets[i];
    const name = channelConfig.participantNames[i];
    const depositAmount = channelConfig.depositAmounts[i];

    console.log(`   ${name} (${wallet.address}):`);

    // Generate MPT key
    const { mptKey, l2Address } = await generateL2Keys(wallet, channelId);
    console.log(`      L2 Address: ${l2Address}`);
    console.log(`      MPT Key: ${mptKey}`);

    // Approve and deposit
    const tokenWithSigner = tonContract.connect(wallet) as ethers.Contract;
    await (await tokenWithSigner.approve(DEPOSIT_MANAGER_PROXY_ADDRESS, depositAmount)).wait();

    const depositManagerWithSigner = depositManagerContract.connect(wallet) as ethers.Contract;
    await (await depositManagerWithSigner.depositToken(channelId, depositAmount, mptKey)).wait();
    console.log(`      ✅ Deposited ${ethers.formatEther(depositAmount)} ${channelConfig.targetTokenSymbol}\n`);
  }

  return channelId;
}

// ============================================================================
// PHASE 2: INITIALIZE CHANNEL STATE (via Frontend)
// ============================================================================

async function waitForChannelInitialization(channelId: number): Promise<string> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('PHASE 2: Initialize Channel State');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('   ⚠️  Channel initialization requires Groth16 proof generation');
  console.log('   ⚠️  This must be done through the frontend UI\n');

  console.log('   ┌─────────────────────────────────────────────────────────────┐');
  console.log('   │                    MANUAL STEP REQUIRED                     │');
  console.log('   ├─────────────────────────────────────────────────────────────┤');
  console.log('   │                                                             │');
  console.log('   │  1. Clone the frontend repository:                          │');
  console.log('   │     git clone https://github.com/tokamak-network/           │');
  console.log('   │                Tokamak-zkp-channel-manager                  │');
  console.log('   │                                                             │');
  console.log('   │  2. Install dependencies and run:                           │');
  console.log('   │     cd Tokamak-zkp-channel-manager                          │');
  console.log('   │     npm install                                             │');
  console.log('   │     npm run dev                                             │');
  console.log('   │                                                             │');
  console.log('   │  3. Open http://localhost:3000 in your browser              │');
  console.log('   │                                                             │');
  console.log('   │  4. Connect your wallet (Leader account)                    │');
  console.log('   │                                                             │');
  console.log('   │  5. Navigate to "Initialize State" page                     │');
  console.log('   │                                                             │');
  console.log(`   │  6. Select Channel ${channelId} and click "Initialize"       │`);
  console.log('   │                                                             │');
  console.log('   │  7. Wait for the transaction to complete                    │');
  console.log('   │                                                             │');
  console.log('   │  8. Copy the Initialize TX Hash from the success message   │');
  console.log('   │                                                             │');
  console.log('   └─────────────────────────────────────────────────────────────┘\n');

  console.log(`   📌 Channel ID: ${channelId}\n`);

  // Wait for user confirmation with retry loop
  let initTxHash: string = '';
  
  while (true) {
    const { readyStatus } = await inquirer.prompt([
      {
        type: 'list',
        name: 'readyStatus',
        message: 'Channel initialization status:',
        choices: [
          { name: '✅ Initialization complete - Enter TX Hash', value: 'complete' },
          { name: '⏳ Still working on it - Wait', value: 'wait' },
          { name: '❌ Cancel and exit', value: 'cancel' },
        ],
        default: 'complete',
      },
    ]);

    if (readyStatus === 'complete') {
      const { txHash } = await inquirer.prompt([
        {
          type: 'input',
          name: 'txHash',
          message: 'Enter the Initialize TX Hash:',
          validate: (input) => {
            if (!input || !input.startsWith('0x') || input.length !== 66) {
              return 'Please enter a valid transaction hash (0x...)';
            }
            return true;
          },
        },
      ]);
      initTxHash = txHash;
      break;
    } else if (readyStatus === 'cancel') {
      const { confirmCancel } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmCancel',
          message: 'Are you sure you want to cancel? (Channel setup will be lost)',
          default: false,
        },
      ]);
      
      if (confirmCancel) {
        console.log('\n   ❌ Initialization cancelled by user\n');
        throw new Error('Channel initialization not completed');
      }
      // If not confirmed, continue the loop
      console.log('\n   👍 Continuing...\n');
    } else {
      // readyStatus === 'wait'
      console.log('\n   ⏳ Take your time. Press Enter when ready to check again.\n');
    }
  }

  console.log(`\n   ✅ Channel initialized!`);
  console.log(`   TX Hash: ${initTxHash}\n`);

  // Recommend saving to .env
  console.log('   💡 TIP: Save these values to your .env file for future runs:');
  console.log(`      CHANNEL_ID=${channelId}`);
  console.log(`      INITIALIZE_TX_HASH=${initTxHash}\n`);

  return initTxHash;
}

// ============================================================================
// PHASE 3: L2 TRANSFER SIMULATION
// ============================================================================

async function simulateL2Transfer(
  channelId: number,
  initTxHash: string,
  senderWallet: ethers.Wallet,
  recipientL2Address: string,
  amount: string,
  proofNumber: number,
  baseOutputDir: string,
  previousStatePath?: string,
): Promise<{ success: boolean; outputPath: string; stateSnapshotPath: string; previousStateRoot: string; newStateRoot: string }> {
  console.log(`\n📤 Proof #${proofNumber}: Simulating L2 Transfer\n`);

  const { l2PrivateKey, l2Address } = await generateL2Keys(senderWallet, channelId);
  console.log(`   Sender L2 Address: ${l2Address}`);
  console.log(`   Recipient L2 Address: ${recipientL2Address}`);
  console.log(`   Amount: ${amount} TON\n`);

  const adapter = new SynthesizerAdapter({ rpcUrl: SEPOLIA_RPC_URL });
  const outputPath = resolve(baseOutputDir, `proof-${proofNumber}`);

  const result = await adapter.synthesizeL2Transfer({
    channelId,
    initializeTxHash: initTxHash,
    senderL2PrvKey: l2PrivateKey,
    recipientL2Address,
    amount,
    outputPath,
    rollupBridgeAddress: ROLLUP_BRIDGE_CORE_ADDRESS,
    previousStatePath,
  });

  if (!result.success) {
    throw new Error(`Synthesis failed: ${result.error}`);
  }

  console.log(`   ✅ Synthesis completed`);
  console.log(`   Previous State Root: ${result.previousStateRoot}`);
  console.log(`   New State Root: ${result.newStateRoot}`);

  return {
    success: true,
    outputPath: result.instancePath || outputPath,
    stateSnapshotPath: result.stateSnapshotPath,
    previousStateRoot: result.previousStateRoot,
    newStateRoot: result.newStateRoot,
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  // Get configuration
  const { config: channelConfig, useExisting, existingChannelId, existingInitTxHash } = await getInteractiveConfig();

  // Setup provider and wallets
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  const leaderWallet = new ethers.Wallet(channelConfig.leaderPrivateKey, provider);
  const participantWallets = channelConfig.participantPrivateKeys.map(pk => new ethers.Wallet(pk, provider));
  const allWallets = [leaderWallet, ...participantWallets];

  let channelId: number;
  let initTxHash: string;
  let outputDir: string;

  if (useExisting && existingChannelId && existingInitTxHash) {
    // Use existing channel
    channelId = existingChannelId;
    initTxHash = existingInitTxHash;
    outputDir = resolve(OUTPUT_BASE, channelId.toString());
    mkdirSync(outputDir, { recursive: true });
    console.log(`\n📍 Using existing channel: ${channelId}`);
    console.log(`   Initialize TX: ${initTxHash}\n`);
  } else {
    // Phase 1: Setup new channel
    channelId = await setupChannel(channelConfig, provider, allWallets);
    outputDir = resolve(OUTPUT_BASE, channelId.toString());
    mkdirSync(outputDir, { recursive: true });

    // Generate L2 keys for channel info
    const participantInfos = [];
    for (let i = 0; i < allWallets.length; i++) {
      const wallet = allWallets[i];
      const { mptKey } = await generateL2Keys(wallet, channelId);
      participantInfos.push({
        address: wallet.address,
        name: channelConfig.participantNames[i],
        deposit: channelConfig.depositAmounts[i].toString(),
        mptKey,
      });
    }

    // Save channel info (before initialization) with detailed participant info
    const channelInfoPath = resolve(outputDir, 'channel_info.json');
    writeFileSync(channelInfoPath, JSON.stringify({
      channelId,
      targetContract: channelConfig.targetContract,
      targetTokenSymbol: channelConfig.targetTokenSymbol,
      status: 'awaiting_initialization',
      participants: participantInfos,
      createdAt: new Date().toISOString(),
    }, null, 2), 'utf-8');
    console.log(`   📝 Channel info saved to: ${channelInfoPath}\n`);

    // Phase 2: Wait for user to initialize via frontend
    initTxHash = await waitForChannelInitialization(channelId);

    // Update channel info with initTxHash
    writeFileSync(channelInfoPath, JSON.stringify({
      channelId,
      targetContract: channelConfig.targetContract,
      targetTokenSymbol: channelConfig.targetTokenSymbol,
      initTxHash,
      status: 'initialized',
      participants: participantInfos,
      createdAt: new Date().toISOString(),
    }, null, 2), 'utf-8');
    console.log(`   📝 Channel info updated with initTxHash\n`);
  }

  // Phase 3: L2 Transfer Simulation
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('PHASE 3: L2 Transfer Simulation');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Generate L2 addresses for all participants
  const l2Infos: L2KeyInfo[] = [];
  for (const wallet of allWallets) {
    const l2Info = await generateL2Keys(wallet, channelId);
    l2Infos.push(l2Info);
  }

  console.log('   📋 Available Accounts:\n');
  l2Infos.forEach((info, i) => {
    console.log(`   [${i}] ${channelConfig.participantNames[i]}`);
    console.log(`       L1: ${allWallets[i].address}`);
    console.log(`       L2: ${info.l2Address}\n`);
  });

  // Interactive: Select sender
  const senderChoices = channelConfig.participantNames.map((name, i) => ({
    name: `${name} (${allWallets[i].address.slice(0, 10)}...)`,
    value: i,
  }));

  const { senderIndex } = await inquirer.prompt([
    {
      type: 'list',
      name: 'senderIndex',
      message: 'Select SENDER account:',
      choices: senderChoices,
      default: 0,
    },
  ]);

  // Interactive: Select recipient (exclude sender)
  const recipientChoices = channelConfig.participantNames
    .map((name, i) => ({
      name: `${name} (L2: ${l2Infos[i].l2Address.slice(0, 14)}...)`,
      value: i,
    }))
    .filter((_, i) => i !== senderIndex);

  const { recipientIndex } = await inquirer.prompt([
    {
      type: 'list',
      name: 'recipientIndex',
      message: 'Select RECIPIENT account:',
      choices: recipientChoices,
      default: recipientChoices[0]?.value || 0,
    },
  ]);

  // Interactive: Input transfer amount
  const { transferAmount } = await inquirer.prompt([
    {
      type: 'input',
      name: 'transferAmount',
      message: `Transfer amount (in ${channelConfig.targetTokenSymbol}):`,
      default: '1',
      validate: (input) => {
        const num = parseFloat(input);
        if (isNaN(num) || num <= 0) return 'Please enter a positive number';
        return true;
      },
    },
  ]);

  const senderWallet = allWallets[senderIndex];
  const recipientL2Address = l2Infos[recipientIndex].l2Address;

  console.log('\n   📤 Transfer Configuration:');
  console.log(`      From: ${channelConfig.participantNames[senderIndex]} (${senderWallet.address})`);
  console.log(`      To:   ${channelConfig.participantNames[recipientIndex]} (L2: ${recipientL2Address})`);
  console.log(`      Amount: ${transferAmount} ${channelConfig.targetTokenSymbol}\n`);

  // Simulate L2 Transfer
  const result1 = await simulateL2Transfer(
    channelId,
    initTxHash,
    senderWallet,
    recipientL2Address,
    transferAmount,
    1,
    outputDir,
  );

  // Phase 4: Proof Generation and Verification
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('PHASE 4: Proof Generation and Verification');
  console.log('═══════════════════════════════════════════════════════════════');

  // Preprocess (only needed for first proof)
  const preprocessSuccess = await runPreprocess(result1.outputPath);
  if (!preprocessSuccess) {
    throw new Error('Preprocess failed');
  }

  // Prove
  const proveSuccess = await runProver(result1.outputPath);
  if (!proveSuccess) {
    throw new Error('Prove failed');
  }

  // Verify
  const verifySuccess = await runVerify(result1.outputPath);
  if (!verifySuccess) {
    throw new Error('Verification failed');
  }

  // Summary
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Test Complete!                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('📊 Summary:');
  console.log(`   - Channel ID: ${channelId}`);
  console.log(`   - Initialize TX: ${initTxHash}`);
  console.log(`   - Previous State Root: ${result1.previousStateRoot}`);
  console.log(`   - New State Root: ${result1.newStateRoot}`);
  console.log(`   - Proof Generated: ✅`);
  console.log(`   - Verification: ✅ PASSED\n`);

  console.log('📁 Output Files:');
  console.log(`   - ${result1.outputPath}/\n`);
}

// Run
main()
  .then(() => {
    console.log('🎉 End-to-end test completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  });

