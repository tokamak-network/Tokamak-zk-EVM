/**
 * L2 State Channel Transaction Test using Simplified SynthesizerAdapter API
 *
 * This demonstrates the simplified high-level interface where:
 * - No manual calldata generation required
 * - No manual state loading required
 * - No manual blockNumber fetching required
 * - Just provide: channelId, senderKey, recipient, amount, and optional previousStatePath
 */

import { ethers } from 'ethers';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SEPOLIA_RPC_URL, ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI } from './constants.ts';
import {
  bytesToBigInt,
  bigIntToBytes,
  setLengthLeft,
  utf8ToBytes,
} from '@ethereumjs/util';
import { poseidon, fromEdwardsToAddress } from '../../src/TokamakL2JS/index.ts';
import { jubjub } from '@noble/curves/misc';
import { SynthesizerAdapter } from '../../src/interface/adapters/synthesizerAdapter.ts';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
const envPath = resolve(__dirname, '../../../../../.env');
config({ path: envPath });

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Derive L2 address from L2 private key
 */
function deriveL2AddressFromPrivateKey(l2PrivateKey: Uint8Array): string {
  const publicKey = jubjub.Point.BASE.multiply(bytesToBigInt(l2PrivateKey)).toBytes();
  const l2Address = fromEdwardsToAddress(jubjub.Point.fromBytes(publicKey)).toString();
  return l2Address;
}

// ============================================================================
// MAIN TEST FUNCTION
// ============================================================================

async function main() {
  const CHANNEL_ID = parseInt(process.env.CHANNEL_ID || '1');
  const INITIALIZE_TX_HASH =
    process.env.INITIALIZE_TX_HASH || '0xc804a68999c6153dbe505ac634ee65f7c588acce07fa8310bf485f27e0f245e1';

  // Read L1 private keys from environment (for testing only)
  const PRIVATE_KEYS = [process.env.ALICE_PRIVATE_KEY, process.env.BOB_PRIVATE_KEY, process.env.CHARLIE_PRIVATE_KEY];
  if (!PRIVATE_KEYS[0] || !PRIVATE_KEYS[1] || !PRIVATE_KEYS[2]) {
    console.error('❌ Error: Private keys not found in .env file');
    process.exit(1);
  }

  // Get participants from on-chain
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  const bridgeContract = new ethers.Contract(ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, provider);
  const participants: string[] = await bridgeContract.getChannelParticipants(CHANNEL_ID);

  console.warn('⚠️  WARNING: Generating L2 keys from L1 keys for testing purposes.');
  console.warn('   In production, L2 private keys should be provided directly.\n');

  // Generate L2 private keys (for testing)
  const PARTICIPANT_NAMES = ['Alice', 'Bob', 'Charlie'];
  const participantL2PrivateKeys: Uint8Array[] = [];

  for (let i = 0; i < participants.length; i++) {
    const l1Address = participants[i];
    const participantIndex = participants.findIndex(addr => addr.toLowerCase() === l1Address.toLowerCase());

    if (participantIndex === -1 || !PRIVATE_KEYS[participantIndex]) {
      throw new Error(`Private key not found for participant ${l1Address}`);
    }

    const wallet = new ethers.Wallet(PRIVATE_KEYS[participantIndex]!);
    if (wallet.address.toLowerCase() !== l1Address.toLowerCase()) {
      throw new Error(`Address mismatch: expected ${l1Address}, got ${wallet.address}`);
    }

    // Generate L2 private key
    const l1PublicKeyHex = wallet.signingKey.publicKey;
    const seedString = `${l1PublicKeyHex}${CHANNEL_ID}${PARTICIPANT_NAMES[participantIndex]!}`;
    const seedBytes = utf8ToBytes(seedString);
    const seedHashBytes = poseidon(seedBytes);
    const seedHashBigInt = bytesToBigInt(seedHashBytes);
    const privateKeyBigInt = seedHashBigInt % jubjub.Point.Fn.ORDER;
    const privateKeyValue = privateKeyBigInt === 0n ? 1n : privateKeyBigInt;
    const l2PrivateKey = setLengthLeft(bigIntToBytes(privateKeyValue), 32);

    participantL2PrivateKeys.push(l2PrivateKey);
  }

  // Derive L2 addresses from L2 private keys
  const allL2Addresses: string[] = participantL2PrivateKeys.map(deriveL2AddressFromPrivateKey);

  // Create SynthesizerAdapter instance
  const adapter = new SynthesizerAdapter({ rpcUrl: SEPOLIA_RPC_URL });

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Test: Sequential L2 Transfers (Simplified Interface)       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ========================================================================
  // PROOF #1: Participant 1 → 2 (1 TON)
  // ========================================================================
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  Proof #1: Participant 1 → 2 (1 TON)         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const result1 = await adapter.synthesizeL2Transfer({
    channelId: CHANNEL_ID,
    initializeTxHash: INITIALIZE_TX_HASH,
    senderL2PrvKey: participantL2PrivateKeys[0],
    recipientL2Address: allL2Addresses[1],
    amount: '1',
    outputPath: resolve(__dirname, '../test-outputs/adapter-test-1'),
    rollupBridgeAddress: ROLLUP_BRIDGE_CORE_ADDRESS,
  });

  if (!result1.success) {
    console.error(`❌ Proof #1 failed: ${result1.error}`);
    process.exit(1);
  }

  console.log(`✅ Proof #1 completed`);
  console.log(`   Previous State Root: ${result1.previousStateRoot}`);
  console.log(`   New State Root:      ${result1.newStateRoot}`);
  console.log(`   State Snapshot:      ${result1.stateSnapshotPath}\n`);

  // Display participant balances after Proof #1
  console.log('📊 Participant Balances after Proof #1:');
  const balances1 = await adapter.getParticipantBalances({
    stateSnapshotPath: result1.stateSnapshotPath,
    channelId: CHANNEL_ID,
    rollupBridgeAddress: ROLLUP_BRIDGE_CORE_ADDRESS,
  });
  console.log(`   State Root: ${balances1.stateRoot}`);
  balances1.participants.forEach((participant, idx) => {
    console.log(`   Participant ${idx + 1}:`);
    console.log(`     L1 Address: ${participant.l1Address}`);
    console.log(`     L2 MPT Key: ${participant.l2MptKey}`);
    console.log(`     Balance:    ${participant.balanceInEther} TON`);
  });
  console.log('');

  // ========================================================================
  // PROOF #2: Participant 2 → 3 (0.5 TON)
  // ========================================================================
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  Proof #2: Participant 2 → 3 (0.5 TON)       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const result2 = await adapter.synthesizeL2Transfer({
    channelId: CHANNEL_ID,
    initializeTxHash: INITIALIZE_TX_HASH,
    senderL2PrvKey: participantL2PrivateKeys[1],
    recipientL2Address: allL2Addresses[2],
    amount: '0.5',
    previousStatePath: result1.stateSnapshotPath, // Chain from Proof #1
    outputPath: resolve(__dirname, '../test-outputs/adapter-test-2'),
    rollupBridgeAddress: ROLLUP_BRIDGE_CORE_ADDRESS,
  });

  if (!result2.success) {
    console.error(`❌ Proof #2 failed: ${result2.error}`);
    process.exit(1);
  }

  console.log(`✅ Proof #2 completed`);
  console.log(`   Previous State Root: ${result2.previousStateRoot}`);
  console.log(`   New State Root:      ${result2.newStateRoot}`);
  console.log(`   State Snapshot:      ${result2.stateSnapshotPath}\n`);

  // Display participant balances after Proof #2
  console.log('📊 Participant Balances after Proof #2:');
  const balances2 = await adapter.getParticipantBalances({
    stateSnapshotPath: result2.stateSnapshotPath,
    channelId: CHANNEL_ID,
    rollupBridgeAddress: ROLLUP_BRIDGE_CORE_ADDRESS,
  });
  console.log(`   State Root: ${balances2.stateRoot}`);
  balances2.participants.forEach((participant, idx) => {
    console.log(`   Participant ${idx + 1}:`);
    console.log(`     L1 Address: ${participant.l1Address}`);
    console.log(`     L2 MPT Key: ${participant.l2MptKey}`);
    console.log(`     Balance:    ${participant.balanceInEther} TON`);
  });
  console.log('');

  // ========================================================================
  // PROOF #3: Participant 3 → 1 (1 TON)
  // ========================================================================
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  Proof #3: Participant 3 → 1 (1 TON)          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const result3 = await adapter.synthesizeL2Transfer({
    channelId: CHANNEL_ID,
    initializeTxHash: INITIALIZE_TX_HASH,
    senderL2PrvKey: participantL2PrivateKeys[2],
    recipientL2Address: allL2Addresses[0],
    amount: '1',
    previousStatePath: result2.stateSnapshotPath, // Chain from Proof #2
    outputPath: resolve(__dirname, '../test-outputs/adapter-test-3'),
    rollupBridgeAddress: ROLLUP_BRIDGE_CORE_ADDRESS,
  });

  if (!result3.success) {
    console.error(`❌ Proof #3 failed: ${result3.error}`);
    process.exit(1);
  }

  console.log(`✅ Proof #3 completed`);
  console.log(`   Previous State Root: ${result3.previousStateRoot}`);
  console.log(`   New State Root:      ${result3.newStateRoot}`);
  console.log(`   State Snapshot:      ${result3.stateSnapshotPath}\n`);

  // Display participant balances after Proof #3
  console.log('📊 Participant Balances after Proof #3:');
  const balances3 = await adapter.getParticipantBalances({
    stateSnapshotPath: result3.stateSnapshotPath,
    channelId: CHANNEL_ID,
    rollupBridgeAddress: ROLLUP_BRIDGE_CORE_ADDRESS,
  });
  console.log(`   State Root: ${balances3.stateRoot}`);
  balances3.participants.forEach((participant, idx) => {
    console.log(`   Participant ${idx + 1}:`);
    console.log(`     L1 Address: ${participant.l1Address}`);
    console.log(`     L2 MPT Key: ${participant.l2MptKey}`);
    console.log(`     Balance:    ${participant.balanceInEther} TON`);
  });
  console.log('');

  // ========================================================================
  // SUMMARY
  // ========================================================================
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                     Test Summary                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log('✅ Successfully completed sequential transfer simulation!');
  console.log('');
  console.log('📊 State Root Evolution:');
  console.log(`   Initial (On-chain):         ${result1.previousStateRoot}`);
  console.log(`   → Proof #1 (P1→P2, 1 TON):   ${result1.newStateRoot}`);
  console.log(`   → Proof #2 (P2→P3, 0.5 TON): ${result2.newStateRoot}`);
  console.log(`   → Proof #3 (P3→P1, 1 TON):   ${result3.newStateRoot}`);
  console.log('');
  console.log('🎯 API Features:');
  console.log('   ✅ No manual calldata generation');
  console.log('   ✅ No manual state loading');
  console.log('   ✅ No manual blockNumber fetching');
  console.log('   ✅ State analysis: getParticipantBalances()');
  console.log('   ✅ Just call adapter.synthesizeL2Transfer() with high-level params');
}

// Run test
main()
  .then(() => {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  });
