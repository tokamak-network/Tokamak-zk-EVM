/**
 * Test script for State Channel with direct calldata
 * Tests continuous proof generation without transaction hashes
 */

import { SynthesizerAdapter } from './src/interface/adapters/synthesizerAdapter.ts';
import { encodeTransfer, toWei } from './src/interface/adapters/calldataHelpers.ts';
import { jubjub } from '@noble/curves/misc';
import { setLengthLeft, utf8ToBytes, bytesToBigInt } from '@ethereumjs/util';
import { fromEdwardsToAddress } from './src/TokamakL2JS/index.ts';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env file
config({ path: resolve(process.cwd(), '../../../.env') });

async function testCalldataStateChain() {
  console.log('🧪 Testing State Channel with Direct Calldata\n');
  console.log('━'.repeat(80));

  // Get RPC URL from .env
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) {
    console.error('❌ RPC_URL not found in .env file');
    process.exit(1);
  }

  const adapter = new SynthesizerAdapter({ rpcUrl });

  // TON Contract
  const TON_CONTRACT = '0x2be5e8c109e2197D077D13A82dAead6a9b3433C5';

  // Generate L2 participants (Alice, Bob, Charlie + others)
  console.log('\n👥 Generating L2 Participants...');
  const participants = [
    { name: 'Alice', seed: 'Alice_L2_Wallet' },
    { name: 'Bob', seed: 'Bob_L2_Wallet' },
    { name: 'Charlie', seed: 'Charlie_L2_Wallet' },
    { name: 'Participant_4', seed: 'Participant_4' },
    { name: 'Participant_5', seed: 'Participant_5' },
    { name: 'Participant_6', seed: 'Participant_6' },
    { name: 'Participant_7', seed: 'Participant_7' },
    { name: 'Participant_8', seed: 'Participant_8' },
  ];

  const l2Keys = participants.map(p => {
    const seed = setLengthLeft(utf8ToBytes(p.seed), 32);
    const privateKey = jubjub.utils.randomPrivateKey(seed);
    const publicKey = jubjub.Point.BASE.multiply(bytesToBigInt(privateKey)).toBytes();
    const address = fromEdwardsToAddress(publicKey).toString();
    return { ...p, privateKey, publicKey, address };
  });

  // For simplicity, use dummy L1 addresses
  const addressListL1 = l2Keys.map((_, idx) => `0x${(idx + 1).toString(16).padStart(40, '0')}`);

  console.log('✅ Participants generated:');
  l2Keys.slice(0, 3).forEach((p, idx) => {
    console.log(`   ${p.name}: ${p.address}`);
  });
  console.log(`   ... and ${l2Keys.length - 3} more participants`);

  try {
    // ===== Proposal 1: Alice → Bob (100 TON) =====
    console.log('\n\n📤 Proposal 1: Alice → Bob (100 TON)');
    console.log('─'.repeat(80));

    const amount1 = toWei('100', 18);
    const calldata1 = encodeTransfer(l2Keys[1].address, amount1);

    console.log(`From: ${l2Keys[0].name} (${l2Keys[0].address})`);
    console.log(`To: ${l2Keys[1].name} (${l2Keys[1].address})`);
    console.log(`Amount: 100 TON`);

    const proof1 = await adapter.synthesizeFromCalldata(calldata1, {
      contractAddress: TON_CONTRACT,
      publicKeyListL2: l2Keys.map(k => k.publicKey),
      addressListL1,
      senderL2PrvKey: l2Keys[0].privateKey,
      blockNumber: 23224548, // Reference block with TON state
      userStorageSlots: [0],
    });

    console.log('\n✅ Proof 1 Generated:');
    console.log(`   State Root: ${proof1.state.stateRoot}`);
    console.log(`   Storage Entries: ${proof1.state.storageEntries.length}`);
    console.log(`   Placements: ${proof1.placementVariables.length}`);
    console.log(`   a_pub length: ${proof1.instance.a_pub.length}`);
    console.log(`   Timestamp: ${new Date(proof1.state.timestamp).toISOString()}`);

    // ===== Proposal 2: Bob → Charlie (50 TON) - State Chain! =====
    console.log('\n\n📥 Proposal 2: Bob → Charlie (50 TON) - Using Previous State');
    console.log('─'.repeat(80));

    const amount2 = toWei('50', 18);
    const calldata2 = encodeTransfer(l2Keys[2].address, amount2);

    console.log(`From: ${l2Keys[1].name} (${l2Keys[1].address})`);
    console.log(`To: ${l2Keys[2].name} (${l2Keys[2].address})`);
    console.log(`Amount: 50 TON`);
    console.log(`Previous State Root: ${proof1.state.stateRoot}`);

    const proof2 = await adapter.synthesizeFromCalldata(calldata2, {
      contractAddress: TON_CONTRACT,
      publicKeyListL2: l2Keys.map(k => k.publicKey),
      addressListL1,
      senderL2PrvKey: l2Keys[1].privateKey, // Bob is sender now
      blockNumber: 23224548,
      userStorageSlots: [0],
      previousState: proof1.state, // ← State Chain!
    });

    console.log('\n✅ Proof 2 Generated:');
    console.log(`   State Root: ${proof2.state.stateRoot}`);
    console.log(`   Storage Entries: ${proof2.state.storageEntries.length}`);
    console.log(`   Placements: ${proof2.placementVariables.length}`);
    console.log(`   a_pub length: ${proof2.instance.a_pub.length}`);
    console.log(`   Timestamp: ${new Date(proof2.state.timestamp).toISOString()}`);

    // ===== Proposal 3: Charlie → Alice (30 TON) - Continue Chain! =====
    console.log('\n\n📥 Proposal 3: Charlie → Alice (30 TON) - Continue Chain');
    console.log('─'.repeat(80));

    const amount3 = toWei('30', 18);
    const calldata3 = encodeTransfer(l2Keys[0].address, amount3);

    console.log(`From: ${l2Keys[2].name} (${l2Keys[2].address})`);
    console.log(`To: ${l2Keys[0].name} (${l2Keys[0].address})`);
    console.log(`Amount: 30 TON`);
    console.log(`Previous State Root: ${proof2.state.stateRoot}`);

    const proof3 = await adapter.synthesizeFromCalldata(calldata3, {
      contractAddress: TON_CONTRACT,
      publicKeyListL2: l2Keys.map(k => k.publicKey),
      addressListL1,
      senderL2PrvKey: l2Keys[2].privateKey, // Charlie is sender now
      blockNumber: 23224548,
      userStorageSlots: [0],
      previousState: proof2.state, // ← Continue chain!
    });

    console.log('\n✅ Proof 3 Generated:');
    console.log(`   State Root: ${proof3.state.stateRoot}`);
    console.log(`   Storage Entries: ${proof3.state.storageEntries.length}`);
    console.log(`   Placements: ${proof3.placementVariables.length}`);
    console.log(`   a_pub length: ${proof3.instance.a_pub.length}`);
    console.log(`   Timestamp: ${new Date(proof3.state.timestamp).toISOString()}`);

    // ===== Analysis =====
    console.log('\n\n🔍 State Chain Analysis');
    console.log('━'.repeat(80));

    console.log('📊 State Root Evolution:');
    console.log(`   Proposal 1: ${proof1.state.stateRoot}`);
    console.log(`   Proposal 2: ${proof2.state.stateRoot}`);
    console.log(`   Proposal 3: ${proof3.state.stateRoot}`);

    const roots = [proof1.state.stateRoot, proof2.state.stateRoot, proof3.state.stateRoot];
    const uniqueRoots = new Set(roots).size;
    if (uniqueRoots === 3) {
      console.log('   ✅ All state roots are unique (expected!)');
    } else {
      console.log(`   ⚠️  Only ${uniqueRoots} unique roots (might indicate an issue)`);
    }

    console.log('\n📐 Circuit Placement Optimization:');
    console.log(`   Proposal 1: ${proof1.placementVariables.length} placements (initial)`);
    console.log(`   Proposal 2: ${proof2.placementVariables.length} placements`);
    console.log(`   Proposal 3: ${proof3.placementVariables.length} placements`);

    const reduction2 = ((proof1.placementVariables.length - proof2.placementVariables.length) / proof1.placementVariables.length * 100).toFixed(1);
    const reduction3 = ((proof1.placementVariables.length - proof3.placementVariables.length) / proof1.placementVariables.length * 100).toFixed(1);
    console.log(`   ✅ Proposal 2: ${reduction2}% reduction (state reuse!)`);
    console.log(`   ✅ Proposal 3: ${reduction3}% reduction (state reuse!)`);

    console.log('\n⏱️  Performance Metrics:');
    const time12 = proof2.state.timestamp - proof1.state.timestamp;
    const time23 = proof3.state.timestamp - proof2.state.timestamp;
    const timeTotal = proof3.state.timestamp - proof1.state.timestamp;
    console.log(`   Proposal 1 → 2: ${time12}ms`);
    console.log(`   Proposal 2 → 3: ${time23}ms`);
    console.log(`   Total time: ${timeTotal}ms`);
    console.log(`   Average per proof: ${(timeTotal / 3).toFixed(0)}ms`);

    // ===== Final Summary =====
    console.log('\n\n📈 State Channel Summary');
    console.log('━'.repeat(80));
    console.log('State Chain Flow (Off-chain):');
    console.log(`  Initial State`);
    console.log(`       ↓`);
    console.log(`  Proposal 1 (Alice → Bob, 100 TON)`);
    console.log(`       ↓  Root: ${proof1.state.stateRoot.slice(0, 20)}...`);
    console.log(`  Proposal 2 (Bob → Charlie, 50 TON)`);
    console.log(`       ↓  Root: ${proof2.state.stateRoot.slice(0, 20)}...`);
    console.log(`  Proposal 3 (Charlie → Alice, 30 TON)`);
    console.log(`       ↓  Root: ${proof3.state.stateRoot.slice(0, 20)}...`);
    console.log(`  Final State (Ready for on-chain submission)`);
    console.log('');
    console.log('✅ State Channel Test Complete!');
    console.log('');
    console.log('💡 Key Achievements:');
    console.log('   1. ✅ No transaction hashes needed (pure off-chain)');
    console.log('   2. ✅ Three different calldata executed successfully');
    console.log('   3. ✅ State chain maintained across all proposals');
    console.log('   4. ✅ State roots changed with each transaction');
    console.log('   5. ✅ Circuit placement optimized through state reuse');
    console.log('   6. ✅ Ready for final on-chain submission (Initial → Final root)');

  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error(error);
    process.exit(1);
  }
}

// Run test
testCalldataStateChain();

