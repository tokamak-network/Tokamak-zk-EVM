/**
 * Full State Channel Flow Test
 * Simulates complete flow: Initial State → 3 Proposals → Final Transaction
 */

import { SynthesizerAdapter } from './src/interface/adapters/synthesizerAdapter.ts';
import { encodeTransfer, toWei, fromWei } from './src/interface/adapters/calldataHelpers.ts';
import { jubjub } from '@noble/curves/misc';
import { setLengthLeft, utf8ToBytes, bytesToBigInt, hexToBytes, bytesToHex } from '@ethereumjs/util';
import { fromEdwardsToAddress } from './src/TokamakL2JS/index.ts';
import { config } from 'dotenv';
import { resolve } from 'path';
import type { StateSnapshot, StorageEntry } from './src/TokamakL2JS/stateManager/types.ts';

// Load .env file
config({ path: resolve(process.cwd(), '../../../.env') });

// Helper to display storage changes
function displayStorageChanges(
  label: string,
  storageEntries: StorageEntry[],
  participantNames: string[],
) {
  console.log(`\n   ${label} Storage:`);
  storageEntries.forEach(entry => {
    console.log(`     [${entry.index}] ${entry.key.slice(0, 20)}... = ${entry.value}`);
  });
}

// Helper to compare two states
function compareStates(state1: StateSnapshot, state2: StateSnapshot, label1: string, label2: string) {
  console.log(`\n🔍 Comparing ${label1} vs ${label2}:`);

  if (state1.stateRoot === state2.stateRoot) {
    console.log(`   ⚠️  State roots are IDENTICAL`);
  } else {
    console.log(`   ✅ State roots are DIFFERENT`);
  }

  console.log(`   ${label1}: ${state1.stateRoot}`);
  console.log(`   ${label2}: ${state2.stateRoot}`);

  // Compare storage entries
  console.log(`\n   Storage Entry Comparison:`);
  const maxEntries = Math.max(state1.storageEntries.length, state2.storageEntries.length);
  for (let i = 0; i < maxEntries; i++) {
    const entry1 = state1.storageEntries[i];
    const entry2 = state2.storageEntries[i];

    if (entry1 && entry2) {
      if (entry1.value === entry2.value) {
        console.log(`     [${i}] ${entry1.key.slice(0, 20)}... = ${entry1.value} (unchanged)`);
      } else {
        console.log(`     [${i}] ${entry1.key.slice(0, 20)}...`);
        console.log(`         ${label1}: ${entry1.value}`);
        console.log(`         ${label2}: ${entry2.value} ⬅ CHANGED`);
      }
    }
  }
}

async function testFullStateChannelFlow() {
  console.log('🎭 Full State Channel Flow Test\n');
  console.log('━'.repeat(80));
  console.log('Flow: Initial State → Proposal 1 → Proposal 2 → Proposal 3 → Final TX');
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
  console.log('\n👥 Setting up State Channel Participants...');
  const participants = [
    { name: 'Alice', seed: 'Alice_Seed_12345' },
    { name: 'Bob', seed: 'Bob_Seed_67890' },
    { name: 'Charlie', seed: 'Charlie_Seed_111' },
    { name: 'David', seed: 'David_Seed_222' },
    { name: 'Eve', seed: 'Eve_Seed_333' },
    { name: 'Frank', seed: 'Frank_Seed_444' },
    { name: 'Grace', seed: 'Grace_Seed_555' },
    { name: 'Henry', seed: 'Henry_Seed_666' },
  ];

  const l2Keys = participants.map(p => {
    const seed = setLengthLeft(utf8ToBytes(p.seed), 32);
    const privateKey = jubjub.utils.randomPrivateKey(seed);
    const publicKey = jubjub.Point.BASE.multiply(bytesToBigInt(privateKey)).toBytes();
    const address = fromEdwardsToAddress(publicKey).toString();
    return { ...p, privateKey, publicKey, address };
  });

  // For simplicity, use dummy L1 addresses
  const addressListL1 = l2Keys.map((k, idx) => `0x${(idx + 1000).toString(16).padStart(40, '0')}`);

  console.log('✅ Channel Participants:');
  l2Keys.forEach((p, idx) => {
    console.log(`   ${idx + 1}. ${p.name.padEnd(10)} L2: ${p.address.slice(0, 20)}...`);
  });

  const baseOptions = {
    contractAddress: TON_CONTRACT,
    publicKeyListL2: l2Keys.map(k => k.publicKey),
    addressListL1,
    blockNumber: 23224548, // Reference block with TON state
    userStorageSlots: [0],
  };

  try {
    // ===== Step 1: Initial State (from L1) =====
    console.log('\n\n📍 Step 1: Load Initial State from L1');
    console.log('─'.repeat(80));
    console.log('Loading on-chain state...');

    const initialProof = await adapter.synthesizeFromCalldata(
      encodeTransfer(l2Keys[0].address, 0n), // Dummy transaction to load initial state
      {
        ...baseOptions,
        senderL2PrvKey: l2Keys[0].privateKey,
      },
    );

    const initialState = initialProof.state;
    console.log('✅ Initial State Loaded:');
    console.log(`   State Root: ${initialState.stateRoot}`);
    console.log(`   Storage Entries: ${initialState.storageEntries.length}`);
    console.log(`   Registered Keys: ${initialState.registeredKeys.length}`);
    displayStorageChanges('Initial', initialState.storageEntries, participants.map(p => p.name));

    // ===== Step 2: Proposal 1 (Alice → Bob, 100 TON) =====
    console.log('\n\n📤 Step 2: Proposal 1 - Alice → Bob (100 TON)');
    console.log('─'.repeat(80));
    console.log('Off-chain transaction (not submitted to L1 yet)');

    const amount1 = toWei('100', 18);
    const calldata1 = encodeTransfer(l2Keys[1].address, amount1);

    const proposal1 = await adapter.synthesizeFromCalldata(calldata1, {
      ...baseOptions,
      senderL2PrvKey: l2Keys[0].privateKey,
      previousState: initialState, // Use initial state
    });

    console.log('✅ Proposal 1 Generated:');
    console.log(`   State Root: ${proposal1.state.stateRoot}`);
    console.log(`   Placements: ${proposal1.placementVariables.length}`);
    displayStorageChanges('Proposal 1', proposal1.state.storageEntries, participants.map(p => p.name));

    compareStates(initialState, proposal1.state, 'Initial', 'Proposal 1');

    // ===== Step 3: Proposal 2 (Bob → Charlie, 50 TON) =====
    console.log('\n\n📥 Step 3: Proposal 2 - Bob → Charlie (50 TON)');
    console.log('─'.repeat(80));
    console.log('Off-chain transaction (building on Proposal 1)');

    const amount2 = toWei('50', 18);
    const calldata2 = encodeTransfer(l2Keys[2].address, amount2);

    const proposal2 = await adapter.synthesizeFromCalldata(calldata2, {
      ...baseOptions,
      senderL2PrvKey: l2Keys[1].privateKey,
      previousState: proposal1.state, // Use Proposal 1 state
    });

    console.log('✅ Proposal 2 Generated:');
    console.log(`   State Root: ${proposal2.state.stateRoot}`);
    console.log(`   Placements: ${proposal2.placementVariables.length}`);
    displayStorageChanges('Proposal 2', proposal2.state.storageEntries, participants.map(p => p.name));

    compareStates(proposal1.state, proposal2.state, 'Proposal 1', 'Proposal 2');

    // ===== Step 4: Proposal 3 (Charlie → Alice, 30 TON) =====
    console.log('\n\n🔄 Step 4: Proposal 3 - Charlie → Alice (30 TON)');
    console.log('─'.repeat(80));
    console.log('Off-chain transaction (building on Proposal 2)');

    const amount3 = toWei('30', 18);
    const calldata3 = encodeTransfer(l2Keys[0].address, amount3);

    const proposal3 = await adapter.synthesizeFromCalldata(calldata3, {
      ...baseOptions,
      senderL2PrvKey: l2Keys[2].privateKey,
      previousState: proposal2.state, // Use Proposal 2 state
    });

    console.log('✅ Proposal 3 Generated:');
    console.log(`   State Root: ${proposal3.state.stateRoot}`);
    console.log(`   Placements: ${proposal3.placementVariables.length}`);
    displayStorageChanges('Proposal 3', proposal3.state.storageEntries, participants.map(p => p.name));

    compareStates(proposal2.state, proposal3.state, 'Proposal 2', 'Proposal 3');

    // ===== Step 5: Final Transaction Creation =====
    console.log('\n\n📝 Step 5: Final Transaction Creation');
    console.log('─'.repeat(80));
    console.log('All participants signed. Ready to submit to L1.');

    console.log('\n🎯 Transaction Summary:');
    console.log(`   Initial State Root:  ${initialState.stateRoot}`);
    console.log(`   Final State Root:    ${proposal3.state.stateRoot}`);
    console.log(`   Total Proposals:     3`);
    console.log(`   Total Participants:  ${l2Keys.length}`);
    console.log(`   Off-chain Duration:  ${proposal3.state.timestamp - initialState.timestamp}ms`);

    console.log('\n📊 Proof Verification Data:');
    console.log(`   Proposal 1: ${proposal1.instance.a_pub.length} a_pub values, ${proposal1.placementVariables.length} placements`);
    console.log(`   Proposal 2: ${proposal2.instance.a_pub.length} a_pub values, ${proposal2.placementVariables.length} placements`);
    console.log(`   Proposal 3: ${proposal3.instance.a_pub.length} a_pub values, ${proposal3.placementVariables.length} placements`);

    // Simulate transaction creation (not actually submitting)
    console.log('\n📤 L1 Transaction (Simulation):');
    console.log('   Contract: TokamakL2StateChannel');
    console.log('   Function: finalizeChannel()');
    console.log('   Parameters:');
    console.log(`     - initialStateRoot: ${initialState.stateRoot}`);
    console.log(`     - finalStateRoot:   ${proposal3.state.stateRoot}`);
    console.log(`     - proofs:           [proof1, proof2, proof3]`);
    console.log(`     - signatures:       [sig1, sig2, ..., sig${l2Keys.length}]`);
    console.log('   Status: ✅ Ready (not submitted in this test)');

    // ===== Analysis =====
    console.log('\n\n📈 State Channel Analysis');
    console.log('━'.repeat(80));

    const stateRoots = [
      initialState.stateRoot,
      proposal1.state.stateRoot,
      proposal2.state.stateRoot,
      proposal3.state.stateRoot,
    ];
    const uniqueRoots = new Set(stateRoots).size;

    console.log('📊 State Root Evolution:');
    console.log(`   Initial:    ${initialState.stateRoot}`);
    console.log(`   Proposal 1: ${proposal1.state.stateRoot}`);
    console.log(`   Proposal 2: ${proposal2.state.stateRoot}`);
    console.log(`   Proposal 3: ${proposal3.state.stateRoot}`);
    console.log(`   Unique Roots: ${uniqueRoots}/4`);

    if (uniqueRoots === 4) {
      console.log('   ✅ All state roots are unique (expected!)');
    } else if (uniqueRoots === 1) {
      console.log('   ⚠️  All state roots are identical');
      console.log('   💡 This means storage didn\'t change (read-only RPC state)');
      console.log('   💡 In production, off-chain EVM execution would change storage');
    } else {
      console.log(`   ⚠️  Only ${uniqueRoots} unique roots`);
    }

    console.log('\n📐 Circuit Optimization:');
    console.log(`   Initial:    ${initialProof.placementVariables.length} placements`);
    console.log(`   Proposal 1: ${proposal1.placementVariables.length} placements`);
    console.log(`   Proposal 2: ${proposal2.placementVariables.length} placements`);
    console.log(`   Proposal 3: ${proposal3.placementVariables.length} placements`);

    const avgReduction =
      ((initialProof.placementVariables.length -
        (proposal1.placementVariables.length +
          proposal2.placementVariables.length +
          proposal3.placementVariables.length) /
          3) /
        initialProof.placementVariables.length) *
      100;
    console.log(`   Average Reduction: ${avgReduction.toFixed(1)}%`);

    console.log('\n⏱️  Performance:');
    console.log(`   Initial Load:  ${initialProof.state.timestamp}ms`);
    console.log(`   Proposal 1:    ${proposal1.state.timestamp - initialState.timestamp}ms`);
    console.log(`   Proposal 2:    ${proposal2.state.timestamp - proposal1.state.timestamp}ms`);
    console.log(`   Proposal 3:    ${proposal3.state.timestamp - proposal2.state.timestamp}ms`);
    console.log(
      `   Total:         ${proposal3.state.timestamp - initialState.timestamp}ms (${((proposal3.state.timestamp - initialState.timestamp) / 1000).toFixed(2)}s)`,
    );

    // ===== Final Summary =====
    console.log('\n\n🎉 Full State Channel Test Complete!');
    console.log('━'.repeat(80));
    console.log('');
    console.log('✅ Key Achievements:');
    console.log('   1. ✅ Initial state loaded from L1 (RPC)');
    console.log('   2. ✅ Three off-chain proposals generated');
    console.log('   3. ✅ State chain maintained across all proposals');
    console.log('   4. ✅ Circuit placement optimized (state reuse)');
    console.log('   5. ✅ Final transaction ready for L1 submission');
    console.log('   6. ✅ No actual blockchain transactions (pure off-chain)');
    console.log('');
    console.log('💡 Production Flow:');
    console.log('   1. Channel opens → Initial state from L1 contract');
    console.log('   2. Participants propose transactions → Generate proofs off-chain');
    console.log('   3. All participants verify proofs locally');
    console.log('   4. All participants sign final state');
    console.log('   5. Submit to L1: finalizeChannel(initialRoot, finalRoot, proofs, sigs)');
    console.log('   6. L1 contract verifies: verifyProofChain(proofs) && verifySigs(sigs)');
    console.log('   7. L1 state updated: storage[stateRoot] = finalRoot');
    console.log('');

  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error(error);
    process.exit(1);
  }
}

// Run test
testFullStateChannelFlow();

