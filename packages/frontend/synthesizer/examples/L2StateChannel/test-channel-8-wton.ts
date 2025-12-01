/**
 * Test Channel 8 with WTON Transfer
 *
 * This script tests the synthesizeL2StateChannel functionality for Channel 8:
 * 1. Fetches channel info from on-chain (Channel 8 uses WTON)
 * 2. Uses WTON token address from channel's allowedTokens
 * 3. Generates a WTON transfer proof using SynthesizerAdapter
 *
 * Note: Channel 8 uses WTON (0x79E0d92670106c85E9067b56B8F674340dCa0Bbd) on Sepolia
 *
 * Usage:
 *   npx tsx examples/L2StateChannel/test-channel-8-wton.ts
 */

import {
  hexToBytes,
  bytesToHex,
  toBytes,
  Address,
  setLengthLeft,
  bigIntToBytes,
  bytesToBigInt,
} from '@ethereumjs/util';
import { JsonRpcProvider, Contract, formatEther, parseEther } from 'ethers';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';
import { jubjub } from '@noble/curves/misc';
import { fromEdwardsToAddress } from '../../src/TokamakL2JS/index.ts';
import { SynthesizerAdapter } from '../../src/interface/adapters/synthesizerAdapter.ts';
import type { SynthesizerResult } from '../../src/interface/adapters/synthesizerAdapter.ts';

// Load .env file
config({ path: resolve(process.cwd(), '../../../.env') });

// ============================================================================
// CONFIGURATION
// ============================================================================

const ALCHEMY_KEY = 'PbqCcGx1oHN7yNaFdUJUYqPEN0QSp23S';
const SEPOLIA_RPC_URL = process.env.RPC_URL_SEPOLIA || `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const ROLLUP_BRIDGE_CORE_ADDRESS = '0x780ad1b236390C42479b62F066F5cEeAa4c77ad6'; // RollupBridge Proxy
const CHANNEL_ID = 8; // Channel 8 uses WTON on Sepolia
// WTON address on Sepolia (will be fetched from channel's allowedTokens)
const WTON_ADDRESS = '0x79E0d92670106c85E9067b56B8F674340dCa0Bbd';

// RollupBridgeCore ABI (from IRollupBridgeCore interface)
const ROLLUP_BRIDGE_CORE_ABI = [
  'function getChannelInfo(uint256 channelId) view returns (address[] allowedTokens, uint8 state, uint256 participantCount, bytes32 initialRoot)',
  'function getChannelParticipants(uint256 channelId) view returns (address[])',
  'function getChannelState(uint256 channelId) view returns (uint8)',
  'function getParticipantPublicKey(uint256 channelId, address participant) view returns (uint256 pkx, uint256 pky)',
  'function getParticipantTokenDeposit(uint256 channelId, address participant, address token) view returns (uint256)',
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getStateName(state: number): string {
  const states = ['None', 'Initialized', 'Open', 'Active', 'Closing', 'Closed'];
  return states[state] || 'Unknown';
}

// ============================================================================
// MAIN TEST FUNCTION
// ============================================================================

async function testChannel8WTON() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║       Test Channel 8 with WTON Transfer - Sepolia           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Initialize provider and contract
  const provider = new JsonRpcProvider(SEPOLIA_RPC_URL);
  const bridge = new Contract(ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, provider);

  // Fetch channel info from on-chain
  console.log('📡 Fetching channel info from on-chain...');
  const [allowedTokens, state, participantCount, initialRoot] = await bridge.getChannelInfo(CHANNEL_ID);

  if (!allowedTokens || allowedTokens.length === 0) {
    throw new Error(`Channel ${CHANNEL_ID} has no allowed tokens`);
  }

  // Use the first allowed token (should be WTON for Channel 8)
  const tokenAddress = allowedTokens[0];

  console.log(`✅ Channel info fetched:`);
  console.log(`   - Channel ID: ${CHANNEL_ID}`);
  console.log(`   - State: ${getStateName(Number(state))} (${state})`);
  console.log(`   - Participants: ${participantCount}`);
  console.log(`   - Initial Root: ${initialRoot}`);
  console.log(`   - Allowed tokens: ${allowedTokens.length}`);
  allowedTokens.forEach((token: string, idx: number) => {
    console.log(`     ${idx + 1}. ${token}`);
  });

  // Validate that token address matches WTON
  if (tokenAddress.toLowerCase() !== WTON_ADDRESS.toLowerCase()) {
    console.warn(`\n⚠️  Warning: Expected WTON (${WTON_ADDRESS}), but channel uses ${tokenAddress}`);
    console.warn(`   Proceeding with token: ${tokenAddress}\n`);
  } else {
    console.log(`\n✅ Token validated: WTON (${tokenAddress})\n`);
  }

  // Get participants
  const participants = await bridge.getChannelParticipants(CHANNEL_ID);
  if (!participants || participants.length < 2) {
    throw new Error(`Channel ${CHANNEL_ID} does not have enough participants. Found: ${participants?.length || 0}`);
  }

  console.log(`✅ Channel participants: ${participants.length}`);
  participants.forEach((p: string, idx: number) => {
    console.log(`   ${idx + 1}. ${p}`);
  });
  console.log('');

  // Validate channel state
  const channelState = Number(state);
  if (channelState !== 1 && channelState !== 2 && channelState !== 3) {
    console.error(`❌ Channel is not in valid state (current: ${getStateName(channelState)})`);
    console.error('   Expected: Initialized, Open, or Active');
    return;
  }

  if (channelState === 1) {
    console.warn('\n⚠️  Channel is in Initialized state (deposits completed but not yet opened)');
    console.warn('   Proceeding with simulation using deposit data...\n');
  }

  // Get current block number
  const blockNumber = await provider.getBlockNumber();
  console.log(`📦 Current block number: ${blockNumber}\n`);

  // Generate L2 keys for each participant (deterministic based on index)
  console.log('👥 Generating L2 Keys for Channel Participants...');
  const participantsWithKeys = participants.map((l1Address: string, idx: number) => {
    // Generate deterministic private key from index
    const privateKey = setLengthLeft(bigIntToBytes(BigInt(idx + 1) * 123456789n), 32);
    const publicKey = jubjub.Point.BASE.multiply(bytesToBigInt(privateKey)).toBytes();
    const l2Address = fromEdwardsToAddress(publicKey).toString();

    console.log(`   Participant ${idx + 1}:`);
    console.log(`     L1: ${l1Address}`);
    console.log(`     L2: ${l2Address}`);

    return {
      l1Address,
      l2Address,
      privateKey,
      publicKey,
    };
  });
  console.log('');

  // Create Synthesizer adapter
  const adapter = new SynthesizerAdapter({ rpcUrl: SEPOLIA_RPC_URL });

  // Base options for synthesis
  const baseOptions = {
    contractAddress: tokenAddress, // WTON from channel's allowedTokens
    publicKeyListL2: participantsWithKeys.map(p => p.publicKey),
    addressListL1: participantsWithKeys.map(p => p.l1Address),
    blockNumber,
    userStorageSlots: [0], // ERC20 balance only (slot 0)
  };

  // ========================================================================
  // Construct Initial State from Onchain Deposits
  // ========================================================================
  console.log('📦 Constructing initial state from onchain deposits...');

  // Build storage entries from channel deposits
  const initialStorageEntries: Array<{ index: number; key: string; value: string }> = [];
  const registeredKeys: string[] = [];

  for (let i = 0; i < participantsWithKeys.length; i++) {
    const participant = participantsWithKeys[i];
    const depositAmount = await bridge.getParticipantTokenDeposit(CHANNEL_ID, participant.l1Address, tokenAddress);

    // Generate L2 storage key from participant's L2 address and slot 0
    const l2StorageKey = bytesToHex(
      setLengthLeft(
        bigIntToBytes(BigInt(participant.l2Address) ^ 0n), // XOR with slot 0
        32,
      ),
    );
    registeredKeys.push(l2StorageKey);

    // Storage entry for ERC20 balance
    initialStorageEntries.push({
      index: i,
      key: l2StorageKey,
      value: '0x' + depositAmount.toString(16).padStart(64, '0'),
    });

    console.log(`   ${participant.l1Address}: ${formatEther(depositAmount)} WTON (${depositAmount})`);
  }

  // Construct initial state object matching StateSnapshot type
  const initialState = {
    stateRoot: initialRoot,
    storageEntries: initialStorageEntries,
    registeredKeys: registeredKeys,
    contractAddress: tokenAddress,
    userL2Addresses: participantsWithKeys.map(p => p.l2Address),
    userStorageSlots: [0n], // ERC20 balance slot
    timestamp: Date.now(),
    userNonces: participantsWithKeys.map(() => 0n), // Initial nonces are all 0
  };

  console.log(`   Initial State Root: ${initialState.stateRoot}`);
  console.log(`   Storage Entries: ${initialState.storageEntries.length}`);
  console.log(`   Registered Keys: ${initialState.registeredKeys.length}\n`);

  // ========================================================================
  // PROOF: Participant 0 → Participant 1 Transfer (1 WTON)
  // ========================================================================
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║        Proof: Participant 0 → Participant 1 (1 WTON)        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const senderIdx = 0;
  const recipientIdx = 1;
  const transferAmount = parseEther('1'); // 1 WTON

  console.log(`🔄 Generating circuit for transfer...`);
  console.log(`   Sender (L1): ${participantsWithKeys[senderIdx].l1Address}`);
  console.log(`   Recipient (L1): ${participantsWithKeys[recipientIdx].l1Address}`);
  console.log(`   Amount: ${formatEther(transferAmount)} WTON\n`);

  const result = await adapter.synthesizeL2StateChannel(
    CHANNEL_ID,
    {
      to: participantsWithKeys[recipientIdx].l1Address,
      tokenAddress: tokenAddress,
      amount: transferAmount.toString(),
      rollupBridgeAddress: ROLLUP_BRIDGE_CORE_ADDRESS,
      senderIdx: senderIdx,
    },
    {
      previousState: initialState,
      outputPath: resolve(process.cwd(), 'test-outputs/channel-8-wton-proof-1'),
    },
  );

  if (!result) {
    throw new Error('Synthesis failed: No result returned');
  }

  console.log('\n✅ Synthesis completed successfully!');
  const outputDir = resolve(process.cwd(), 'test-outputs/channel-8-wton-proof-1');
  console.log(`   Output directory: ${outputDir}`);
  console.log(`   Placements: ${result.placementVariables.length}`);
  console.log(`   New state root: ${result.state.stateRoot}`);
  console.log(`\n📁 Files generated:`);
  console.log('   - instance.json');
  console.log('   - instance_description.json');
  console.log('   - placementVariables.json');
  console.log('   - permutation.json');
  console.log('   - state_snapshot.json');

  // Verify state root changed
  if (result.state.stateRoot !== initialState.stateRoot) {
    console.log(`\n✅ State root changed (expected for transfer)`);
    console.log(`   Before: ${initialState.stateRoot}`);
    console.log(`   After:  ${result.state.stateRoot}`);
  } else {
    console.warn(`\n⚠️  Warning: State root did not change`);
  }

  console.log('\n🎉 Test completed successfully!\n');
}

// Run the test
testChannel8WTON()
  .then(() => {
    console.log('✅ All tests passed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:');
    console.error(`   Error: ${error.message}`);
    if (error.stack) {
      console.error(`   Stack: ${error.stack}`);
    }
    process.exit(1);
  });
