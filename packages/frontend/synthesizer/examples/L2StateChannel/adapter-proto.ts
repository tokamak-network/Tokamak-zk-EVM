/**
 * L2 State Channel Transaction Synthesizer using SynthesizerAdapter
 *
 * This module provides functions to synthesize L2 state channel transactions:
 * 1. First transaction after initializeChannelState: Restores state from on-chain data
 * 2. Subsequent transactions: Restores state from previous state_info.json
 *
 * Based on snapshot.ts logic, but uses SynthesizerAdapter for consistent interface.
 */

import { ethers, parseEther } from 'ethers';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { SEPOLIA_RPC_URL, ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI } from './constants.ts';
import {
  hexToBytes,
  addHexPrefix,
  bytesToBigInt,
  bigIntToBytes,
  setLengthLeft,
  utf8ToBytes,
} from '@ethereumjs/util';
import { poseidon, fromEdwardsToAddress } from '../../src/TokamakL2JS/index.ts';
import { jubjub } from '@noble/curves/misc.js';
import { SynthesizerAdapter } from '../../src/interface/adapters/synthesizerAdapter.ts';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
const envPath = resolve(__dirname, '../../../../../.env');
config({ path: envPath });

// ============================================================================
// TYPES
// ============================================================================

// StateSnapshot type definition (matches SynthesizerAdapter usage)
interface StateSnapshot {
  stateRoot: string;
  registeredKeys: string[];
  storageEntries: Array<{ index?: number; key: string; value: string }>;
  contractAddress: string;
  preAllocatedLeaves?: Array<{ key: string; value: string }>;
  contractCode?: string;
  userL2Addresses?: string[];
  userStorageSlots?: bigint[];
  userNonces?: bigint[];
}

export interface SynthesizeL2TransferParams {
  channelId: number;
  initializeTxHash: string;
  senderL2PrvKey: Uint8Array;
  recipientL2Address: string; // L2 address of recipient
  amount: string; // Amount as string (e.g., "1" for 1 TON)
  previousStatePath?: string; // Optional: path to previous state_snapshot.json
  outputPath?: string; // Optional: path for outputs
  rpcUrl?: string; // Optional: RPC URL (defaults to SEPOLIA_RPC_URL)
  rollupBridgeAddress?: string; // Optional: RollupBridge contract address (defaults to ROLLUP_BRIDGE_CORE_ADDRESS)
}

export interface SynthesizeL2TransferResult {
  success: boolean;
  stateRoot: string;
  previousStateRoot: string;
  newStateRoot: string;
  stateInfoPath: string;
  outputPath?: string;
  error?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Derive L2 public key from L2 private key
 */
function deriveL2PublicKeyFromPrivateKey(l2PrivateKey: Uint8Array): Uint8Array {
  const publicKey = jubjub.Point.BASE.multiply(bytesToBigInt(l2PrivateKey)).toBytes();
  return publicKey;
}

/**
 * Derive L2 address from L2 public key
 */
function deriveL2AddressFromPublicKey(publicKey: Uint8Array): string {
  const l2Address = fromEdwardsToAddress(jubjub.Point.fromBytes(publicKey)).toString();
  return l2Address;
}

/**
 * Load StateSnapshot from state_snapshot.json file
 */
function loadStateFromFile(stateSnapshotPath: string): StateSnapshot {
  if (!existsSync(stateSnapshotPath)) {
    throw new Error(`State snapshot file not found: ${stateSnapshotPath}`);
  }

  const stateSnapshot = JSON.parse(readFileSync(stateSnapshotPath, 'utf-8'));
  return stateSnapshot as StateSnapshot;
}

// ============================================================================
// MAIN SYNTHESIS FUNCTION
// ============================================================================

/**
 * Synthesize L2 transfer transaction using SynthesizerAdapter
 *
 * @param params - Transaction parameters
 * @returns Synthesis result with state information
 */
export async function synthesizeL2Transfer(
  params: SynthesizeL2TransferParams,
): Promise<SynthesizeL2TransferResult> {
  const {
    channelId,
    initializeTxHash,
    senderL2PrvKey,
    recipientL2Address,
    amount,
    previousStatePath,
    outputPath,
    rpcUrl = SEPOLIA_RPC_URL,
  } = params;

  try {
    // Create SynthesizerAdapter
    const adapter = new SynthesizerAdapter({ rpcUrl });

    // Load previous state if this is a subsequent transaction
    let previousState: StateSnapshot | undefined;
    let previousStateRoot: string;

    if (previousStatePath) {
      console.log(`📸 Loading previous state from ${previousStatePath}...`);
      previousState = loadStateFromFile(previousStatePath);
      previousStateRoot = previousState.stateRoot;
      console.log(`   ✅ Previous state root: ${previousStateRoot}`);
    } else {
      console.log('📸 First transaction: SynthesizerAdapter will fetch state from on-chain...');
      // Get state root from initialize transaction for verification
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const receipt = await provider.getTransactionReceipt(initializeTxHash);
      if (!receipt) {
        throw new Error('Transaction receipt not found');
      }
      const stateInitializedTopic = ethers.id('StateInitialized(uint256,bytes32)');
      const stateInitializedEvent = receipt.logs.find(log => log.topics[0] === stateInitializedTopic);
      if (!stateInitializedEvent) {
        throw new Error('StateInitialized event not found in transaction receipt');
      }
      const iface = new ethers.Interface(['event StateInitialized(uint256 indexed channelId, bytes32 currentStateRoot)']);
      const decodedEvent = iface.decodeEventLog('StateInitialized', stateInitializedEvent.data, stateInitializedEvent.topics);
      previousStateRoot = decodedEvent.currentStateRoot;
      console.log(`   ✅ Initial state root: ${previousStateRoot}`);
    }

    // Build transfer calldata
    const transferAmount = parseEther(amount);
    const calldata = SynthesizerAdapter.buildTransferCalldata(recipientL2Address, transferAmount);

    // Get block number from initialize transaction
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const tx = await provider.getTransaction(initializeTxHash);
    if (tx === null || tx.blockNumber === null) {
      throw new Error('Initialize transaction not found or not yet mined');
    }

    // Synthesize using SynthesizerAdapter
    // SynthesizerAdapter will automatically:
    // - Fetch channel data and target contract address from on-chain
    // - Build initStorageKeys with L1 addresses and MPT keys
    // - Restore storage values and rebuild merkle tree
    const result = await adapter.synthesizeFromCalldata(calldata, {
      contractAddress: '', // Will be fetched from on-chain channel data
      senderL2PrvKey,
      blockNumber: tx.blockNumber,
      previousState,
      outputPath,
      channelId,
      rollupBridgeAddress: params.rollupBridgeAddress || ROLLUP_BRIDGE_CORE_ADDRESS,
      rpcUrl,
    });

    // Save state_snapshot.json (SynthesizerAdapter already saves this)
    const finalStateSnapshotPath = outputPath
      ? resolve(outputPath, 'state_snapshot.json')
      : resolve(__dirname, '../test-outputs/l2-state-channel-transfer', 'state_snapshot.json');

    // Note: SynthesizerAdapter already writes state_snapshot.json in synthesizeFromCalldata
    // So we don't need to write it again here, just return the path

    return {
      success: result.executionResult?.success ?? false,
      stateRoot: result.state.stateRoot,
      previousStateRoot,
      newStateRoot: result.state.stateRoot,
      stateInfoPath: finalStateSnapshotPath,
      outputPath,
    };
  } catch (error: any) {
    return {
      success: false,
      stateRoot: '',
      previousStateRoot: '',
      newStateRoot: '',
      stateInfoPath: '',
      outputPath,
      error: error.message || String(error),
    };
  }
}

// ============================================================================
// TEST FUNCTION
// ============================================================================

/**
 * Test function for sequential transfers using SynthesizerAdapter
 *
 * @param channelId - Channel ID
 * @param initializeTxHash - Transaction hash of initializeChannelState
 * @param participantL2PrivateKeys - L2 private keys for all participants
 */
export async function testSequentialTransfersWithAdapter(
  channelId: number,
  initializeTxHash: string,
  participantL2PrivateKeys: Uint8Array[],
) {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Test: Sequential L2 Transfers using SynthesizerAdapter  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Derive L2 addresses from L2 private keys
  const allL2Addresses: string[] = participantL2PrivateKeys.map(privKey => {
    const publicKey = deriveL2PublicKeyFromPrivateKey(privKey);
    return deriveL2AddressFromPublicKey(publicKey);
  });

  // Proof #1: First transaction (from on-chain)
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  Proof #1: Participant 1 → 2 (1 TON)         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const result1 = await synthesizeL2Transfer({
    channelId,
    initializeTxHash,
    senderL2PrvKey: participantL2PrivateKeys[0],
    recipientL2Address: allL2Addresses[1],
    amount: '1',
    outputPath: resolve(__dirname, '../test-outputs/adapter-test-1'),
  });

  if (!result1.success) {
    console.error(`❌ Proof #1 failed: ${result1.error}`);
    process.exit(1);
  }

  console.log(`✅ Proof #1 completed`);
  console.log(`   Previous State Root: ${result1.previousStateRoot}`);
  console.log(`   New State Root:      ${result1.newStateRoot}`);
  console.log(`   State Info:          ${result1.stateInfoPath}\n`);

  // Proof #2: Subsequent transaction (from state_info.json)
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  Proof #2: Participant 2 → 3 (0.5 TON)       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const result2 = await synthesizeL2Transfer({
    channelId,
    initializeTxHash,
    senderL2PrvKey: participantL2PrivateKeys[1],
    recipientL2Address: allL2Addresses[2],
    amount: '0.5',
    previousStatePath: result1.stateInfoPath,
    outputPath: resolve(__dirname, '../test-outputs/adapter-test-2'),
  });

  if (!result2.success) {
    console.error(`❌ Proof #2 failed: ${result2.error}`);
    process.exit(1);
  }

  console.log(`✅ Proof #2 completed`);
  console.log(`   Previous State Root: ${result2.previousStateRoot}`);
  console.log(`   New State Root:      ${result2.newStateRoot}`);
  console.log(`   State Info:          ${result2.stateInfoPath}\n`);

  // Proof #3: Subsequent transaction (from state_info.json)
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  Proof #3: Participant 3 → 1 (1 TON)          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const result3 = await synthesizeL2Transfer({
    channelId,
    initializeTxHash,
    senderL2PrvKey: participantL2PrivateKeys[2],
    recipientL2Address: allL2Addresses[0],
    amount: '1',
    previousStatePath: result2.stateInfoPath,
    outputPath: resolve(__dirname, '../test-outputs/adapter-test-3'),
  });

  if (!result3.success) {
    console.error(`❌ Proof #3 failed: ${result3.error}`);
    process.exit(1);
  }

  console.log(`✅ Proof #3 completed`);
  console.log(`   Previous State Root: ${result3.previousStateRoot}`);
  console.log(`   New State Root:      ${result3.newStateRoot}`);
  console.log(`   State Info:          ${result3.stateInfoPath}\n`);

  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                     Test Summary                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log('✅ Successfully completed sequential transfer simulation!');
  console.log('');
  console.log('📊 State Root Evolution:');
  console.log(`   Initial (Onchain):         ${result1.previousStateRoot}`);
  console.log(`   → Proof #1 (P1→P2, 1 TON):  ${result1.newStateRoot}`);
  console.log(`   → Proof #2 (P2→P3, 0.5 TON): ${result2.newStateRoot}`);
  console.log(`   → Proof #3 (P3→P1, 1 TON):  ${result3.newStateRoot}`);
}

// ============================================================================
// MAIN TEST (for direct execution)
// ============================================================================

async function main() {
  // These should be provided as command-line arguments or environment variables
  const CHANNEL_ID = parseInt(process.env.CHANNEL_ID || '3');
  const INITIALIZE_TX_HASH = process.env.INITIALIZE_TX_HASH || '0xcf31e988b30825eb4e8a5f3ceb0a2b5cd2462dc4881dc6e2f58cfdb184acaeea';

  // Note: In production, L2 private keys should be provided as parameters
  // Since the channel is already initialized, MPT keys are available on-chain
  // but L2 private keys need to be provided by the caller
  // For testing purposes, we'll generate them from L1 private keys
  // (This is a limitation - in production, L2 keys should be stored securely)

  // Read L1 private keys from environment (for testing only)
  const PRIVATE_KEYS = [process.env.ALICE_PRIVATE_KEY, process.env.BOB_PRIVATE_KEY, process.env.CHARLIE_PRIVATE_KEY];
  if (!PRIVATE_KEYS[0] || !PRIVATE_KEYS[1] || !PRIVATE_KEYS[2]) {
    console.error('❌ Error: Private keys not found in .env file');
    console.error('Note: In production, L2 private keys should be provided directly, not generated from L1 keys');
    process.exit(1);
  }

  // Get participants
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  const bridgeContract = new ethers.Contract(ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, provider);
  const participants: string[] = await bridgeContract.getChannelParticipants(CHANNEL_ID);

  // TODO: In production, L2 private keys should be provided as parameters
  // For now, we'll need to generate them (this is a limitation)
  // The channel is already initialized, so MPT keys are on-chain,
  // but L2 private keys still need to be generated or provided
  console.warn('⚠️  WARNING: Generating L2 keys from L1 keys for testing purposes.');
  console.warn('   In production, L2 private keys should be provided directly.');

  // For testing, we'll generate L2 keys (this should be replaced with actual L2 keys in production)
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

    // Generate L2 private key (same logic as before, but inline)
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

  await testSequentialTransfersWithAdapter(
    CHANNEL_ID,
    INITIALIZE_TX_HASH,
    participantL2PrivateKeys,
  );
}

// Run test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => {
      console.log('🎉 All tests passed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Test failed:', error.message);
      console.error('Stack:', error.stack);
      process.exit(1);
    });
}
