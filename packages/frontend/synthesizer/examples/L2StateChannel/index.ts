/**
 * L2 State Channel Transfer Example
 *
 * This example uses the pre-existing Channel 55 (Sepolia testnet).
 * Run synthesizer to simulate L2 transfers and generate circuit outputs.
 *
 * Channel 55 Configuration:
 * - Target Token: TON (0xa30fe40285B8f5c0457DbC3B7C8A280373c40044)
 * - Initialize TX: 0x48ba10b55d6798a75ab904bb3317b546411a0e38f4ad6290573558648889136c
 * - Participants: 3 (each deposited 1 TON)
 *
 * Usage:
 *   cd packages/frontend/synthesizer
 *   npx tsx examples/L2StateChannel/index.ts
 *
 * Output:
 *   examples/L2StateChannel/output/transfer-{N}/
 */

import { select, input, confirm } from '@inquirer/prompts';
import { ethers } from 'ethers';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import {
  ROLLUP_BRIDGE_CORE_ADDRESS,
} from '../../src/interface/adapters/constants/index.ts';
import {
  L2_PRV_KEY_MESSAGE,
  deriveL2KeysFromSignature,
  deriveL2AddressFromKeys,
} from '../../src/TokamakL2JS/utils/web.ts';
import { SynthesizerAdapter } from '../../src/interface/adapters/synthesizerAdapter.ts';
import { bytesToHex } from '@ethereumjs/util';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from L2StateChannel example folder
const envPath = resolve(__dirname, '.env');
config({ path: envPath });

// ============================================================================
// CHANNEL 55 CONFIGURATION (Pre-existing on Sepolia)
// ============================================================================

const CHANNEL_55 = {
  channelId: 55,
  targetContract: '0xa30fe40285B8f5c0457DbC3B7C8A280373c40044',
  targetTokenSymbol: 'TON',
  initTxHash: '0x48ba10b55d6798a75ab904bb3317b546411a0e38f4ad6290573558648889136c',
  participants: [
    {
      name: 'Alice (Leader)',
      l1Address: '0xF9Fa94D45C49e879E46Ea783fc133F41709f3bc7',
      l1PrivateKey: '0xeeb8d41b51594847468e4bfeeb33794d89de6757e4024356a92e561d13331f5c',
      l2Address: '0x044362c7cc8ade5df9669041c1835333b00b3b99',
      deposit: '1 TON',
      mptKey: '0x025970d07b917c499296c906ddcdbf70077962a000db79c0e0d5c8d2954a83fb',
    },
    {
      name: 'Bob',
      l1Address: '0x322acfaA747F3CE5b5899611034FB4433f0Edf34',
      l1PrivateKey: '0x9d075a027c109b853b48ea294c7e6fae097336c2e21525eb1091ced780434905',
      l2Address: '0x370723208ad1ae877716246b983ba8eb89fd813e',
      deposit: '1 TON',
      mptKey: '0x2f79d38b84f6bb89564380022efd4d9cc37c822029b13a225b13c02f53f3f872',
    },
    {
      name: 'Charlie',
      l1Address: '0x31Fbd690BF62cd8C60A93F3aD8E96A6085Dc5647',
      l1PrivateKey: '0x9f2d7bc1ad34409e37ed996688951bf3efc011c061f734958af39131543f4450',
      l2Address: '0xbfa8d60eca7636cbc1dcfd25b5c3c6dd20d70992',
      deposit: '1 TON',
      mptKey: '0x4edcb65427718cdad9cad160b6170273260f437250b55addcbc432414efe70ee',
    },
  ],
};

// Output directory
const OUTPUT_BASE = resolve(__dirname, 'output');

// RPC URL based on DEV_MODE
const DEV_MODE = process.env.DEV_MODE === 'true';
const RPC_URL = DEV_MODE ? process.env.SEPOLIA_RPC_URL : process.env.ETHEREUM_RPC_URL;
if (!RPC_URL) {
  const envVar = DEV_MODE ? 'SEPOLIA_RPC_URL' : 'ETHEREUM_RPC_URL';
  console.error(`❌ ${envVar} not found in .env`);
  console.error(`   Please add ${envVar} to examples/L2StateChannel/.env`);
  process.exit(1);
}

// ============================================================================
// TYPES
// ============================================================================

interface L2Account {
  name: string;
  l1Address: string;
  l2Address: string;
  l2PrivateKey: Uint8Array;
  mptKey: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getNextTransferNumber(): number {
  if (!existsSync(OUTPUT_BASE)) {
    return 1;
  }

  const dirs = readdirSync(OUTPUT_BASE, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith('transfer-'))
    .map(d => parseInt(d.name.replace('transfer-', '')))
    .filter(n => !isNaN(n));

  if (dirs.length === 0) return 1;
  return Math.max(...dirs) + 1;
}

function getPreviousStateSnapshotPath(transferNum: number): string | undefined {
  if (transferNum <= 1) return undefined;

  const prevPath = resolve(OUTPUT_BASE, `transfer-${transferNum - 1}`, 'state_snapshot.json');
  if (existsSync(prevPath)) {
    return prevPath;
  }
  return undefined;
}

/**
 * Get L2 keys for a participant by index.
 * Uses stored L1 private key to sign message and derive L2 keys.
 */
async function getL2KeysForParticipant(participantIndex: number): Promise<{ l2Address: string; l2PrivateKey: Uint8Array }> {
  const participant = CHANNEL_55.participants[participantIndex];
  if (!participant) {
    throw new Error(`Invalid participant index: ${participantIndex}`);
  }
  
  const wallet = new ethers.Wallet(participant.l1PrivateKey);
  const message = `${L2_PRV_KEY_MESSAGE}${CHANNEL_55.channelId}`;
  const signature = (await wallet.signMessage(message)) as `0x${string}`;
  
  const l2Keys = deriveL2KeysFromSignature(signature);
  const l2Address = deriveL2AddressFromKeys(l2Keys);
  
  return {
    l2Address,
    l2PrivateKey: l2Keys.privateKey,
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         L2 State Channel Transfer Example                     ║');
  console.log('║                   Channel 55 (Sepolia)                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Display channel info
  console.log('📋 Channel Configuration:\n');
  console.log(`   Channel ID: ${CHANNEL_55.channelId}`);
  console.log(`   Token: ${CHANNEL_55.targetTokenSymbol} (${CHANNEL_55.targetContract})`);
  console.log(`   Init TX: ${CHANNEL_55.initTxHash}`);
  console.log('');

  console.log('👥 Participants:\n');
  CHANNEL_55.participants.forEach((p, i) => {
    console.log(`   [${i}] ${p.name}`);
    console.log(`       L1 Address: ${p.l1Address}`);
    console.log(`       L2 Address: ${p.l2Address}`);
    console.log(`       Deposit: ${p.deposit}`);
    console.log('');
  });

  // Check for existing transfers
  const nextTransferNum = getNextTransferNumber();
  const previousStatePath = getPreviousStateSnapshotPath(nextTransferNum);

  if (previousStatePath) {
    console.log(`📂 Found previous transfer: transfer-${nextTransferNum - 1}`);
    console.log(`   State snapshot will be used as base for this transfer\n`);
  } else if (nextTransferNum > 1) {
    console.log(`⚠️  No state snapshot found from previous transfers`);
    console.log(`   Will start from initial channel state\n`);
  }

  console.log(`📝 This will be: transfer-${nextTransferNum}\n`);

  // Derive L2 keys for all participants using stored signatures
  // No .env required - everything is hardcoded for easy testing
  const l2Accounts: L2Account[] = [];

  console.log('🔑 Loading L2 Keys from stored signatures...\n');

  for (let i = 0; i < CHANNEL_55.participants.length; i++) {
    const participant = CHANNEL_55.participants[i];

    try {
      const { l2Address, l2PrivateKey } = await getL2KeysForParticipant(i);
      
      // Verify L2 address matches stored value
      if (l2Address.toLowerCase() !== participant.l2Address.toLowerCase()) {
        console.log(`   ⚠️  ${participant.name}: L2 address mismatch!`);
        console.log(`      Expected: ${participant.l2Address}`);
        console.log(`      Got: ${l2Address}`);
        continue;
      }

      l2Accounts.push({
        name: participant.name,
        l1Address: participant.l1Address,
        l2Address,
        l2PrivateKey,
        mptKey: participant.mptKey,
      });
      console.log(`   ✅ ${participant.name}`);
      console.log(`      L1 Address: ${participant.l1Address}`);
      console.log(`      L2 Address: ${l2Address}`);
      console.log('');
    } catch (e: any) {
      console.log(`   ❌ ${participant.name}: ${e.message}`);
    }
  }

  if (l2Accounts.length === 0) {
    console.error('\n❌ No valid accounts loaded. Please check the signatures in CHANNEL_55 config.');
    process.exit(1);
  }

  // Select sender
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Transfer Configuration');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const senderChoices = l2Accounts.map((acc, i) => ({
    name: `${acc.name} (L2: ${acc.l2Address.slice(0, 14)}...)`,
    value: i,
  }));

  const senderIndex = await select({
    message: 'Select SENDER:',
    choices: senderChoices,
    loop: false,
  });

  const sender = l2Accounts[senderIndex];

  // Select recipient (can be any participant, including those without private keys)
  // All participants have L2 addresses stored - show them directly
  const recipientChoices = CHANNEL_55.participants
    .filter(p => p.l1Address !== sender.l1Address)
    .map((p, i) => ({
      name: `${p.name} (L2: ${p.l2Address.slice(0, 14)}...)`,
      value: i,
    }));

  const recipientIndex = await select({
    message: 'Select RECIPIENT:',
    choices: recipientChoices,
    loop: false,
  });

  // Get recipient L2 address - now directly from stored config
  const recipientParticipant = CHANNEL_55.participants.filter(p => p.l1Address !== sender.l1Address)[recipientIndex];
  const recipientL2Address = recipientParticipant.l2Address;
  console.log(`   ✅ Recipient L2 Address: ${recipientL2Address}\n`);

  // Input amount
  const amount = await input({
    message: `Transfer amount (in ${CHANNEL_55.targetTokenSymbol}):`,
    default: '0.1',
    validate: (val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) return 'Please enter a positive number';
      return true;
    },
  });

  // Confirm
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Transfer Summary');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log(`   From: ${sender.name}`);
  console.log(`         L2: ${sender.l2Address}`);
  console.log(`   To:   ${recipientParticipant.name}`);
  console.log(`         L2: ${recipientL2Address}`);
  console.log(`   Amount: ${amount} ${CHANNEL_55.targetTokenSymbol}`);
  console.log(`   Output: transfer-${nextTransferNum}/`);
  if (previousStatePath) {
    console.log(`   Base State: transfer-${nextTransferNum - 1}/state_snapshot.json`);
  } else {
    console.log(`   Base State: Initial channel state`);
  }
  console.log('');

  const confirmed = await confirm({
    message: 'Proceed with this transfer?',
    default: true,
  });

  if (!confirmed) {
    console.log('\n❌ Transfer cancelled');
    process.exit(0);
  }

  // Run synthesizer
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Running Synthesizer');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const outputPath = resolve(OUTPUT_BASE, `transfer-${nextTransferNum}`);
  mkdirSync(outputPath, { recursive: true });

  if (!RPC_URL) {
    const envVar = DEV_MODE ? 'SEPOLIA_RPC_URL' : 'ETHEREUM_RPC_URL';
    console.error(`❌ ${envVar} not found in .env`);
    console.error(`   Please add ${envVar} to examples/L2StateChannel/.env`);
    process.exit(1);
  }

  const adapter = new SynthesizerAdapter({ rpcUrl: RPC_URL });

  console.log('⏳ Synthesizing L2 transfer...\n');

  const result = await adapter.synthesizeL2Transfer({
    channelId: CHANNEL_55.channelId,
    initializeTxHash: CHANNEL_55.initTxHash,
    senderL2PrvKey: sender.l2PrivateKey,
    recipientL2Address: recipientL2Address!,
    amount,
    outputPath,
    rollupBridgeAddress: ROLLUP_BRIDGE_CORE_ADDRESS,
    previousStatePath,
  });

  if (!result.success) {
    console.error(`\n❌ Synthesis failed: ${result.error}`);
    process.exit(1);
  }

  // Save transfer info
  const transferInfo = {
    transferNumber: nextTransferNum,
    channelId: CHANNEL_55.channelId,
    sender: {
      name: sender.name,
      l1Address: sender.l1Address,
      l2Address: sender.l2Address,
    },
    recipient: {
      name: recipientParticipant.name,
      l1Address: recipientParticipant.l1Address,
      l2Address: recipientL2Address,
    },
    amount,
    tokenSymbol: CHANNEL_55.targetTokenSymbol,
    previousStateRoot: result.previousStateRoot,
    newStateRoot: result.newStateRoot,
    basedOnTransfer: previousStatePath ? nextTransferNum - 1 : null,
    createdAt: new Date().toISOString(),
  };

  writeFileSync(
    resolve(outputPath, 'transfer_info.json'),
    JSON.stringify(transferInfo, null, 2),
    'utf-8'
  );

  // Summary
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Synthesis Complete!                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('📊 Results:');
  console.log(`   Previous State Root: ${result.previousStateRoot}`);
  console.log(`   New State Root:      ${result.newStateRoot}`);
  console.log('');

  console.log('📁 Output Files:');
  console.log(`   ${outputPath}/`);
  console.log(`   ├── instance.json`);
  console.log(`   ├── instance_description.json`);
  console.log(`   ├── permutation.json`);
  console.log(`   ├── placementVariables.json`);
  console.log(`   ├── state_snapshot.json`);
  console.log(`   └── transfer_info.json`);
  console.log('');

  console.log('📝 Next Steps:');
  console.log(`   1. To generate proof: ./tokamak-cli --prove ${outputPath}`);
  console.log(`   2. To verify proof:   ./tokamak-cli --verify ${outputPath}`);
  console.log(`   3. To chain another transfer: Run this script again`);
  console.log(`      (It will automatically use transfer-${nextTransferNum}'s state as base)`);
  console.log('');
}

// Run
main()
  .then(() => {
    console.log('🎉 Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  });
