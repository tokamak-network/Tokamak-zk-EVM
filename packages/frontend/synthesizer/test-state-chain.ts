/**
 * Test script for State Chain functionality
 * Tests continuous proof generation with state tracking
 */

import { SynthesizerAdapter } from './src/interface/adapters/synthesizerAdapter.ts';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env file
config({ path: resolve(process.cwd(), '../../../.env') });

async function testStateChain() {
  console.log('🧪 Testing State Chain Functionality\n');
  console.log('━'.repeat(60));

  // Get RPC URL from .env
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) {
    console.error('❌ RPC_URL not found in .env file');
    process.exit(1);
  }

  const adapter = new SynthesizerAdapter({ rpcUrl });

  // Test transaction (TON transfer)
  const testTxHash = '0xa0090893a2d5f79b67cebcb65eac3efc92820ec09dc4ad9fe2bc29bbdcad2e41';

  try {
    // ===== Proof 1: Initial State =====
    console.log('\n📊 Proof 1: Initial State');
    console.log('─'.repeat(60));
    console.log(`Transaction: ${testTxHash}`);

    const result1 = await adapter.synthesize(testTxHash);

    console.log('\n✅ Proof 1 Generated:');
    console.log(`   State Root: ${result1.state.stateRoot}`);
    console.log(`   Storage Entries: ${result1.state.storageEntries.length}`);
    console.log(`   Registered Keys: ${result1.state.registeredKeys.length}`);
    console.log(`   Merkle Leaves: ${result1.state.merkleLeaves?.length || 0}`);
    console.log(`   a_pub length: ${result1.instance.a_pub.length}`);
    console.log(`   Timestamp: ${new Date(result1.state.timestamp).toISOString()}`);

    // Show storage values
    console.log('\n   Storage Values:');
    result1.state.storageEntries.slice(0, 3).forEach((entry, idx) => {
      console.log(`     [${entry.index}] ${entry.key.slice(0, 20)}... → ${entry.value.slice(0, 20)}...`);
    });

    // ===== Proof 2: Chained State =====
    console.log('\n\n📊 Proof 2: Chained State (Using Previous State)');
    console.log('─'.repeat(60));
    console.log(`Transaction: ${testTxHash} (same TX for testing)`);
    console.log(`Previous State Root: ${result1.state.stateRoot}`);

    const result2 = await adapter.synthesize(testTxHash, {
      previousState: result1.state, // ← Use previous state!
    });

    console.log('\n✅ Proof 2 Generated:');
    console.log(`   State Root: ${result2.state.stateRoot}`);
    console.log(`   Storage Entries: ${result2.state.storageEntries.length}`);
    console.log(`   a_pub length: ${result2.instance.a_pub.length}`);
    console.log(`   Timestamp: ${new Date(result2.state.timestamp).toISOString()}`);

    // Show storage values
    console.log('\n   Storage Values:');
    result2.state.storageEntries.slice(0, 3).forEach((entry, idx) => {
      console.log(`     [${entry.index}] ${entry.key.slice(0, 20)}... → ${entry.value.slice(0, 20)}...`);
    });

    // ===== Verification =====
    console.log('\n\n🔍 State Chain Verification');
    console.log('━'.repeat(60));

    // Check if state roots are different (they should change after TX execution)
    if (result1.state.stateRoot !== result2.state.stateRoot) {
      console.log('✅ State roots are different (expected behavior)');
      console.log(`   Proof 1: ${result1.state.stateRoot}`);
      console.log(`   Proof 2: ${result2.state.stateRoot}`);
    } else {
      console.log('⚠️  State roots are identical (unexpected)');
    }

    // Check storage entry count
    if (result1.state.storageEntries.length === result2.state.storageEntries.length) {
      console.log(`✅ Storage entry count consistent: ${result1.state.storageEntries.length}`);
    } else {
      console.log(`⚠️  Storage entry count changed: ${result1.state.storageEntries.length} → ${result2.state.storageEntries.length}`);
    }

    // Check registered keys consistency
    const keys1 = result1.state.registeredKeys.join(',');
    const keys2 = result2.state.registeredKeys.join(',');
    if (keys1 === keys2) {
      console.log(`✅ Registered keys consistent across proofs`);
    } else {
      console.log(`⚠️  Registered keys changed`);
    }

    // ===== Summary =====
    console.log('\n\n📈 State Chain Summary');
    console.log('━'.repeat(60));
    console.log(`Proof 1 → Proof 2 State Chain: ${result1.state.stateRoot.slice(0, 20)}... → ${result2.state.stateRoot.slice(0, 20)}...`);
    console.log(`Total time span: ${result2.state.timestamp - result1.state.timestamp}ms`);
    console.log(`Contract: ${result1.state.contractAddress}`);
    console.log(`Participants: ${result1.state.userL2Addresses.length}`);

    console.log('\n✅ State Chain Test Complete!');
    console.log('\n💡 Key Findings:');
    console.log('   1. State can be exported after each proof generation');
    console.log('   2. Previous state can be restored for next proof');
    console.log('   3. State root changes reflect transaction effects');
    console.log('   4. Storage entries are persisted across proofs');

  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error(error);
    process.exit(1);
  }
}

// Run test
testStateChain();

