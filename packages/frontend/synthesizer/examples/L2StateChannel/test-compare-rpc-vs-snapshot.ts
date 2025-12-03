/**
 * Compare RPC initialization vs Snapshot restoration
 *
 * This test compares the registeredKeys order and Merkle tree root
 * between RPC initialization and snapshot restoration.
 */

import { ethers } from 'ethers';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SEPOLIA_RPC_URL, ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI } from './constants.ts';
import { createTokamakL2StateManagerFromL1RPC } from '../../src/TokamakL2JS/stateManager/constructors.ts';
import { StateSnapshot } from '../../src/TokamakL2JS/stateManager/types.ts';
import { Mainnet, Common } from '@ethereumjs/common';
import { Address, hexToBytes, addHexPrefix } from '@ethereumjs/util';
import { poseidon, getEddsaPublicKey } from '../../src/TokamakL2JS/index.ts';
import { deriveL2AddressFromMptKey } from './constants.ts';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
const envPath = resolve(__dirname, '../../../../../.env');
config({ path: envPath });

const RPC_URL = SEPOLIA_RPC_URL;
const CHANNEL_ID = 6;

async function compareRPCvsSnapshot() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Compare RPC Init vs Snapshot Restoration              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const bridgeContract = new ethers.Contract(ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, provider);

  // Get channel info
  const [allowedTokens, state, participantCount, initialRoot] = await bridgeContract.getChannelInfo(CHANNEL_ID);
  const participants: string[] = await bridgeContract.getChannelParticipants(CHANNEL_ID);

  console.log(`Channel ID: ${CHANNEL_ID}`);
  console.log(`On-chain Initial Root: ${initialRoot}`);
  console.log(`Participants: ${participants.length}\n`);

  // Create Common with custom crypto
  const commonOpts = {
    chain: {
      ...Mainnet,
    },
    customCrypto: { keccak256: poseidon, ecrecover: getEddsaPublicKey },
  };
  const common = new Common(commonOpts);

  // ============================================================================
  // Method 1: RPC Initialization
  // ============================================================================
  console.log('🔍 Method 1: RPC Initialization');
  console.log('─────────────────────────────────────────────────────────\n');

  // Derive L2 addresses from MPT keys (same as snapshot method)
  const userL2Addresses: Address[] = [];
  for (const l1Address of participants) {
    const token = allowedTokens[0];
    const mptKeyBigInt = await bridgeContract.getL2MptKey(CHANNEL_ID, l1Address, token);
    const mptKeyHex = '0x' + mptKeyBigInt.toString(16).padStart(64, '0');
    const l2Address = deriveL2AddressFromMptKey(mptKeyHex, 0n, token);
    userL2Addresses.push(new Address(hexToBytes(addHexPrefix(l2Address))));
  }

  const rpcStateManagerOpts = {
    common,
    blockNumber: 9755471, // Block after initializeChannelState
    contractAddress: allowedTokens[0] as `0x${string}`,
    userStorageSlots: [0],
    userL1Addresses: participants as `0x${string}`[],
    userL2Addresses: userL2Addresses,
    // Use on-chain MPT keys
    bridgeContractAddress: ROLLUP_BRIDGE_CORE_ADDRESS as `0x${string}`,
    channelId: BigInt(CHANNEL_ID),
  };

  const rpcStateManager = await createTokamakL2StateManagerFromL1RPC(RPC_URL, rpcStateManagerOpts, false);

  console.log('RegisteredKeys from RPC Init:');
  const rpcRegisteredKeys = rpcStateManager.registeredKeys!;
  rpcRegisteredKeys.forEach((key, idx) => {
    const keyHex = '0x' + Array.from(key).map(b => b.toString(16).padStart(2, '0')).join('');
    console.log(`   [${idx}] ${keyHex}`);
  });
  console.log('');

  const rpcMerkleRoot = rpcStateManager.initialMerkleTree.root;
  const rpcMerkleRootHex = '0x' + rpcMerkleRoot.toString(16).padStart(64, '0').toLowerCase();
  console.log(`RPC Init Merkle Root: ${rpcMerkleRootHex}\n`);

  // ============================================================================
  // Method 2: Snapshot Restoration
  // ============================================================================
  console.log('🔍 Method 2: Snapshot Restoration');
  console.log('─────────────────────────────────────────────────────────\n');

  // Build snapshot from on-chain data
  const snapshotRegisteredKeys: string[] = [];
  const storageEntries: Array<{ index: number; key: string; value: string }> = [];
  const snapshotUserL2Addresses: string[] = [];

  for (let i = 0; i < participants.length; i++) {
    const l1Address = participants[i];
    const token = allowedTokens[0];

    // Get MPT key from on-chain
    const mptKeyBigInt = await bridgeContract.getL2MptKey(CHANNEL_ID, l1Address, token);
    const mptKeyHex = '0x' + mptKeyBigInt.toString(16).padStart(64, '0');

    // Derive L2 address from MPT key
    const l2Address = deriveL2AddressFromMptKey(mptKeyHex, 0n, token);

    // Get deposit amount
    const deposit = await bridgeContract.getParticipantTokenDeposit(CHANNEL_ID, l1Address, token);

    snapshotRegisteredKeys.push(mptKeyHex);
    snapshotUserL2Addresses.push(l2Address);

    const depositHex = '0x' + deposit.toString(16).padStart(64, '0');
    storageEntries.push({
      index: i,
      key: mptKeyHex,
      value: depositHex,
    });
  }

  console.log('RegisteredKeys from Snapshot:');
  snapshotRegisteredKeys.forEach((key, idx) => {
    console.log(`   [${idx}] ${key}`);
  });
  console.log('');

  const snapshot: StateSnapshot = {
    stateRoot: initialRoot,
    registeredKeys: snapshotRegisteredKeys,
    storageEntries: storageEntries,
    contractAddress: allowedTokens[0],
    userL2Addresses: snapshotUserL2Addresses,
    userStorageSlots: [0n],
    timestamp: Date.now(),
    userNonces: participants.map(() => 0n),
  };

  const snapshotStateManagerOpts = {
    common,
    blockNumber: 9755471,
    contractAddress: allowedTokens[0] as `0x${string}`,
    userStorageSlots: [0],
    userL1Addresses: participants as `0x${string}`[],
    userL2Addresses: snapshotUserL2Addresses.map(addr => new Address(hexToBytes(addHexPrefix(addr)))),
  };

  const snapshotStateManager = await createTokamakL2StateManagerFromL1RPC(RPC_URL, snapshotStateManagerOpts, true);
  await snapshotStateManager.createStateFromSnapshot(snapshot, { skipRootValidation: true });

  const snapshotMerkleRoot = snapshotStateManager.initialMerkleTree.root;
  const snapshotMerkleRootHex = '0x' + snapshotMerkleRoot.toString(16).padStart(64, '0').toLowerCase();
  console.log(`Snapshot Merkle Root: ${snapshotMerkleRootHex}\n`);

  // ============================================================================
  // Comparison
  // ============================================================================
  console.log('📊 Comparison');
  console.log('─────────────────────────────────────────────────────────');
  console.log(`On-chain Initial Root: ${initialRoot}`);
  console.log(`RPC Init Merkle Root:  ${rpcMerkleRootHex}`);
  console.log(`Snapshot Merkle Root:  ${snapshotMerkleRootHex}`);
  console.log('─────────────────────────────────────────────────────────\n');

  // Compare registeredKeys
  console.log('🔍 RegisteredKeys Comparison:');
  const keysMatch = rpcRegisteredKeys.length === snapshotRegisteredKeys.length &&
    rpcRegisteredKeys.every((rpcKey, idx) => {
      const rpcKeyHex = '0x' + Array.from(rpcKey).map(b => b.toString(16).padStart(2, '0')).join('');
      const snapshotKeyHex = snapshotRegisteredKeys[idx];
      const match = rpcKeyHex.toLowerCase() === snapshotKeyHex.toLowerCase();
      if (!match) {
        console.log(`   [${idx}] RPC:      ${rpcKeyHex}`);
        console.log(`   [${idx}] Snapshot: ${snapshotKeyHex}`);
        console.log(`   [${idx}] Match: ❌\n`);
      }
      return match;
    });

  if (keysMatch) {
    console.log('   ✅ All registeredKeys match!\n');
  } else {
    console.log('   ❌ registeredKeys do NOT match!\n');
  }

  // Compare Merkle roots
  if (rpcMerkleRootHex.toLowerCase() === initialRoot.toLowerCase()) {
    console.log('✅ RPC Init Merkle Root matches on-chain root!');
  } else {
    console.log('❌ RPC Init Merkle Root does NOT match on-chain root!');
  }

  if (snapshotMerkleRootHex.toLowerCase() === initialRoot.toLowerCase()) {
    console.log('✅ Snapshot Merkle Root matches on-chain root!');
  } else {
    console.log('❌ Snapshot Merkle Root does NOT match on-chain root!');
  }

  if (rpcMerkleRootHex.toLowerCase() === snapshotMerkleRootHex.toLowerCase()) {
    console.log('✅ RPC Init and Snapshot Merkle Roots match!');
  } else {
    console.log('❌ RPC Init and Snapshot Merkle Roots do NOT match!');
  }
}

compareRPCvsSnapshot()
  .then(() => {
    console.log('\n🎉 Comparison complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  });

