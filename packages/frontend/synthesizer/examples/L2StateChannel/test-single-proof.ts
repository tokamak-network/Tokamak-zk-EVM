/**
 * Simple Single Proof Test - Debugging
 */

import { SynthesizerAdapter } from '../../src/interface/adapters/synthesizerAdapter.ts';
import { encodeTransfer, toWei, fromWei } from '../../src/interface/adapters/calldataHelpers.ts';
import { jubjub } from '@noble/curves/misc';
import { fromEdwardsToAddress } from '../../src/TokamakL2JS/index.ts';
import { config } from 'dotenv';
import { resolve } from 'path';
import { ethers } from 'ethers';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

config({ path: resolve(process.cwd(), '../../../.env') });

const SEPOLIA_TON_CONTRACT = '0xa30fe40285b8f5c0457dbc3b7c8a280373c40044';

async function testSingleProof() {
  console.log('═'.repeat(80));
  console.log('🧪 Single Proof Test - Debugging');
  console.log('═'.repeat(80));

  // L2 Keys
  const aliceL2PrivateKey = jubjub.utils.randomPrivateKey();
  const aliceL2PublicKey = jubjub.getPublicKey(aliceL2PrivateKey);

  const bobL2PrivateKey = jubjub.utils.randomPrivateKey();
  const bobL2PublicKey = jubjub.getPublicKey(bobL2PrivateKey);

  // L1 Addresses (real Sepolia addresses)
  const REAL_L1_ADDRESSES = [
    { address: '0x680310ADD42C978D92F195f0DCa8B237Af9c5838', balance: 3684n },
    { address: '0xb1afC197E193f544f6C00a98B4dBB8cb4105871a', balance: 0n },
  ] as const;

  const aliceL1 = REAL_L1_ADDRESSES[0].address;
  const bobL1 = REAL_L1_ADDRESSES[1].address;

  // User storage slots
  const aliceL1Bytes = ethers.getBytes(aliceL1);
  const bobL1Bytes = ethers.getBytes(bobL1);
  const aliceStorageSlot = Number(ethers.toBigInt(ethers.keccak256(aliceL1Bytes)) % 1024n);
  const bobStorageSlot = Number(ethers.toBigInt(ethers.keccak256(bobL1Bytes)) % 1024n);

  console.log(`\n📍 L1 Addresses:`);
  console.log(`   Alice: ${aliceL1} (slot ${aliceStorageSlot})`);
  console.log(`   Bob:   ${bobL1} (slot ${bobStorageSlot})`);

  const sepoliaRPC = process.env.SEPOLIA_RPC_URL || 'https://eth-sepolia.public.blastapi.io';
  const provider = new ethers.JsonRpcProvider(sepoliaRPC);
  const blockNumber = await provider.getBlockNumber();

  console.log(`\n🌐 Network: Sepolia Testnet`);
  console.log(`   RPC: ${sepoliaRPC}`);
  console.log(`   Block: ${blockNumber}`);

  const adapter = new SynthesizerAdapter({ rpcUrl: sepoliaRPC });

  // Single Transfer: Alice → Bob (100 TON)
  console.log(`\n\n${'═'.repeat(80)}`);
  console.log('📝 Generating Proof #1: Alice → Bob (100 TON)');
  console.log('═'.repeat(80));

  const calldata1 = encodeTransfer(bobL1, toWei(100, 18));

  const result1 = await adapter.synthesizeFromCalldata(calldata1, {
    contractAddress: SEPOLIA_TON_CONTRACT,
    publicKeyListL2: [aliceL2PublicKey, bobL2PublicKey],
    addressListL1: [aliceL1, bobL1],
    senderL2PrvKey: aliceL2PrivateKey,
    blockNumber: blockNumber,
    userStorageSlots: [aliceStorageSlot, bobStorageSlot],
    txNonce: 0n,
  });

  console.log(`\n✅ Proof #1 Generated:`);
  console.log(`   State Root: ${result1.state.stateRoot}`);
  console.log(`   a_pub_user: ${result1.instance.a_pub_user.length}`);
  console.log(`   a_pub_block: ${result1.instance.a_pub_block.length}`);
  console.log(`   a_pub_function: ${result1.instance.a_pub_function.length}`);
  console.log(`   Placements: ${result1.placementVariables.length}`);

  // Save outputs
  const outputDir = 'test-outputs/single-proof';
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  writeFileSync(`${outputDir}/instance.json`, JSON.stringify(result1.instance, null, 2));
  writeFileSync(`${outputDir}/placementVariables.json`, JSON.stringify(result1.placementVariables, null, 2));
  writeFileSync(`${outputDir}/permutation.json`, JSON.stringify(result1.permutation, null, 2));
  writeFileSync(
    `${outputDir}/state_snapshot.json`,
    JSON.stringify(result1.state, (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2),
  );

  console.log(`\n💾 Outputs saved to: ${outputDir}`);

  console.log(`\n\n${'═'.repeat(80)}`);
  console.log('✅ Test Complete!');
  console.log('═'.repeat(80));
}

testSingleProof().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
