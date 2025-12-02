/**
 * Test Token Balances from State Snapshot
 *
 * This test verifies that getTokenBalancesFromSnapshot() correctly
 * extracts token balances for all participants from a state snapshot.
 */

import { SynthesizerAdapter } from '../../src/interface/adapters/synthesizerAdapter.ts';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { ethers } from 'ethers';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file
config({ path: resolve(process.cwd(), '../../../.env') });

const ALCHEMY_KEY = process.env.ALCHEMY_KEY || 'PbqCcGx1oHN7yNaFdUJUYqPEN0QSp23S';
const SEPOLIA_RPC_URL = `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`;

// Modular Contract addresses - Updated for new architecture
const ROLLUP_BRIDGE_CORE_ADDRESS = '0x3e47aeefffec5e4bce34426ed6c8914937a65435';
const ROLLUP_BRIDGE_DEPOSIT_MANAGER_ADDRESS = '0xD5E8B17058809B9491F99D35B67A089A2618f5fB';
const ROLLUP_BRIDGE_PROOF_MANAGER_ADDRESS = '0xF0396B7547C7447FBb14A127D3751425893322fc';
const ROLLUP_BRIDGE_WITHDRAW_MANAGER_ADDRESS = '0xAf833c7109DB3BfDAc54a98EA7b123CFDE51d777';
const ROLLUP_BRIDGE_ADMIN_MANAGER_ADDRESS = '0x1c38A6739bDb55f357fcd1aF258E0359ed77c662';

// Token addresses
const TON_ADDRESS = '0xa30fe40285B8f5c0457DbC3B7C8A280373c40044'; // TON token address
const WTON_ADDRESS = '0x79E0d92670106c85E9067b56B8F674340dCa0Bbd';

const CHANNEL_ID = 8;
const RECIPIENT_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const TRANSFER_AMOUNT = '1000000000000000000';

// Helper function to get state name
function getStateName(state: number): string {
  const states = ['None', 'Initialized', 'Open', 'Active', 'Closing', 'Closed'];
  return states[state] || `Unknown(${state})`;
}

// RollupBridgeCore ABI (from documentation)
const ROLLUP_BRIDGE_CORE_ABI = [
  'function getChannelInfo(uint256 channelId) view returns (address[] allowedTokens, uint8 state, uint256 participantCount, bytes32 initialRoot)',
  'function getChannelParticipants(uint256 channelId) view returns (address[])',
  'function getChannelAllowedTokens(uint256 channelId) view returns (address[])',
  'function getParticipantTokenDeposit(uint256 channelId, address participant, address token) view returns (uint256)',
  'function getChannelState(uint256 channelId) view returns (uint8)',
  'function getChannelLeader(uint256 channelId) view returns (address)',
];

async function testTokenBalances() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Test: Token Balances from State Snapshot              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const adapter = new SynthesizerAdapter({ rpcUrl: SEPOLIA_RPC_URL });

  // Step 0: Fetch onchain data from RollupBridgeCore
  console.log('🌐 Step 0: Fetching onchain data from RollupBridgeCore...\n');

  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  const bridgeContract = new ethers.Contract(ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, provider);

  let onchainData: {
    channelInfo: any;
    participants: string[];
    deposits: Map<string, Map<string, bigint>>;
  };

  try {
    // Get channel info
    const [allowedTokens, state, participantCount, initialRoot] = await bridgeContract.getChannelInfo(CHANNEL_ID);
    const participants: string[] = await bridgeContract.getChannelParticipants(CHANNEL_ID);
    const leader = await bridgeContract.getChannelLeader(CHANNEL_ID);

    console.log('✅ Onchain channel data fetched:');
    console.log(`   - Channel ID: ${CHANNEL_ID}`);
    console.log(`   - State: ${state} (${getStateName(Number(state))})`);
    console.log(`   - Participants: ${participantCount}`);
    console.log(`   - Leader: ${leader}`);
    console.log(`   - Allowed Tokens: ${allowedTokens.length}`);
    allowedTokens.forEach((token: string, idx: number) => {
      console.log(`     ${idx + 1}. ${token}`);
    });
    console.log(`   - Initial Root: ${initialRoot}\n`);

    // Get deposits for all participants and tokens
    const deposits = new Map<string, Map<string, bigint>>();
    console.log('📊 Fetching participant deposits...\n');

    for (const participant of participants) {
      const participantDeposits = new Map<string, bigint>();
      for (const token of allowedTokens) {
        const depositAmount = await bridgeContract.getParticipantTokenDeposit(CHANNEL_ID, participant, token);
        const depositBigInt = BigInt(depositAmount.toString());
        participantDeposits.set(token, depositBigInt);

        if (depositBigInt > 0n) {
          const depositWTON = depositBigInt / BigInt(10 ** 18);
          const depositRAY = depositBigInt / BigInt(10 ** 27);
          console.log(
            `   ${participant.slice(0, 10)}...${participant.slice(-8)} → ${token.slice(0, 10)}...${token.slice(-8)}:`,
          );
          console.log(`     Deposit: ${depositBigInt.toString()} wei`);
          console.log(`     Deposit (WTON): ${depositWTON.toString()} WTON`);
          console.log(`     Deposit (RAY): ${depositRAY.toString()} RAY`);
        }
      }
      deposits.set(participant, participantDeposits);
    }

    onchainData = {
      channelInfo: { allowedTokens, state, participantCount, initialRoot, leader },
      participants,
      deposits,
    };

    console.log('\n✅ Onchain data fetched successfully!\n');
  } catch (e: any) {
    console.error('❌ Failed to fetch onchain data:', e.message);
    throw e;
  }

  // Step 1: Read existing state snapshot from test-outputs
  console.log('📝 Step 1: Loading existing state snapshot...\n');

  const stateSnapshotPath = resolve(__dirname, 'test-outputs/state_snapshot.json');
  if (!existsSync(stateSnapshotPath)) {
    throw new Error(`state_snapshot.json not found at: ${stateSnapshotPath}`);
  }

  const stateSnapshotJson = readFileSync(stateSnapshotPath, 'utf-8');
  const stateSnapshot = JSON.parse(stateSnapshotJson);

  console.log('✅ State snapshot loaded successfully!\n');
  console.log(`   File: ${stateSnapshotPath}`);
  console.log(`   State Root: ${stateSnapshot.stateRoot?.substring(0, 20)}...`);
  console.log(`   User L2 Addresses: ${stateSnapshot.userL2Addresses?.length || 0}`);
  console.log(`   Storage Entries: ${stateSnapshot.storageEntries?.length || 0}\n`);

  // Step 2: Test getTokenBalancesFromSnapshot()
  console.log('🔍 Step 2: Testing getTokenBalancesFromSnapshot()...\n');

  const tokenAddresses = [WTON_ADDRESS];
  console.log(`   Token Address: ${WTON_ADDRESS}`);
  console.log(`   Balance Slot: 0 (ERC20 balances mapping)\n`);

  try {
    const balances = adapter.getTokenBalancesFromSnapshot(
      stateSnapshot,
      tokenAddresses,
      0, // ERC20 balances mapping slot
    );

    console.log('✅ Token balances retrieved successfully!\n');

    // Step 3: Display results
    console.log('💰 Step 3: Token Balances:\n');
    console.log('─'.repeat(70));

    let totalParticipants = 0;
    let totalNonZeroBalances = 0;

    for (const [userL2Address, tokenBalances] of balances.entries()) {
      totalParticipants++;
      console.log(`\n👤 Participant: ${userL2Address}`);
      console.log('   ' + '─'.repeat(66));

      for (const [tokenAddress, balance] of tokenBalances.entries()) {
        const balanceBigInt = BigInt(balance);
        // WTON uses 18 decimals, but we'll display in RAY (27 decimals) for precision
        const balanceWei = balanceBigInt.toString();
        const balanceWTON = balanceBigInt / BigInt(10 ** 18); // WTON (18 decimals)
        const balanceRAY = balanceBigInt / BigInt(10 ** 27); // RAY (27 decimals)
        const balanceInRAY = (balanceBigInt * BigInt(10 ** 9)) / BigInt(10 ** 27); // Convert WTON to RAY

        console.log(`   Token: ${tokenAddress}`);
        console.log(`   Balance: ${balanceWei} wei`);
        console.log(`   Balance (WTON): ${balanceWTON.toString()} WTON`);
        console.log(`   Balance (RAY): ${balanceRAY.toString()} RAY`);
        console.log(`   Balance (WTON→RAY): ${balanceInRAY.toString()} RAY`);

        if (balanceBigInt > 0n) {
          totalNonZeroBalances++;
        }
      }
    }

    console.log('\n' + '─'.repeat(70));
    console.log(`\n📊 Summary:`);
    console.log(`   Total Participants: ${totalParticipants}`);
    console.log(`   Total Non-Zero Balances: ${totalNonZeroBalances}`);
    console.log(`   Token Addresses Checked: ${tokenAddresses.length}`);

    // Step 4: Verify the results
    console.log('\n🔍 Step 4: Verifying results...\n');

    // Check that we have balances for all participants
    if (balances.size !== stateSnapshot.userL2Addresses.length) {
      throw new Error(
        `Mismatch: Expected balances for ${stateSnapshot.userL2Addresses.length} participants, ` +
          `but got ${balances.size}`,
      );
    }

    // Check that each participant has a balance entry for each token
    // Use normalized snapshot for comparison
    const normalizedSnapshotForVerification = adapter['normalizeStateSnapshot'](stateSnapshot);
    for (const userL2Address of normalizedSnapshotForVerification.userL2Addresses) {
      if (!balances.has(userL2Address)) {
        throw new Error(`Missing balance entry for participant: ${userL2Address}`);
      }

      const userBalances = balances.get(userL2Address)!;
      for (const tokenAddress of tokenAddresses) {
        if (!userBalances.has(tokenAddress)) {
          throw new Error(`Missing balance for token ${tokenAddress} for participant ${userL2Address}`);
        }
      }
    }

    console.log('✅ All verifications passed!\n');

    // Step 5: Test with multiple tokens (if available)
    console.log('🧪 Step 5: Testing with multiple tokens...\n');

    // Try to get balances for the same token (should work)
    const balancesMultiple = adapter.getTokenBalancesFromSnapshot(
      stateSnapshot,
      [WTON_ADDRESS, WTON_ADDRESS], // Same token twice (should still work)
      0,
    );

    console.log(`✅ Retrieved balances for ${balancesMultiple.size} participants with multiple token queries\n`);

    // Step 6: Compare onchain deposits (L1) with state snapshot balances (L2)
    console.log('🔍 Step 6: Comparing onchain deposits (L1) with state snapshot balances (L2)...\n');
    console.log('   Note: Onchain deposit = L1 initial deposit (does not change after L2 transactions)');
    console.log('         State snapshot balance = L2 actual balance (changes after L2 transactions)\n');

    const normalizedSnapshotForComparison = adapter['normalizeStateSnapshot'](stateSnapshot);
    console.log('─'.repeat(70));

    // Map L2 addresses to L1 addresses (this is a simplified mapping)
    // In reality, you'd need to get the L1 addresses from the channel participants
    // For now, we'll compare based on the order (assuming they match)
    for (let i = 0; i < normalizedSnapshotForComparison.userL2Addresses.length; i++) {
      const userL2Address = normalizedSnapshotForComparison.userL2Addresses[i];
      const l1Address = onchainData.participants[i]; // Assuming same order

      if (!l1Address) {
        console.log(`⚠️  No L1 address found for L2 address: ${userL2Address}`);
        continue;
      }

      console.log(`\n👤 Participant ${i + 1}:`);
      console.log(`   L1 Address: ${l1Address}`);
      console.log(`   L2 Address: ${userL2Address}`);
      console.log('   ' + '─'.repeat(66));

      const snapshotBalances = balances.get(userL2Address);
      const onchainDeposits = onchainData.deposits.get(l1Address);

      for (const tokenAddress of tokenAddresses) {
        const snapshotBalance = snapshotBalances?.get(tokenAddress) || 0n;
        const onchainDeposit = onchainDeposits?.get(tokenAddress) || 0n;

        const snapshotWTON = snapshotBalance / BigInt(10 ** 18);
        const snapshotRAY = snapshotBalance / BigInt(10 ** 27);
        const onchainWTON = onchainDeposit / BigInt(10 ** 18);
        const onchainRAY = onchainDeposit / BigInt(10 ** 27);

        console.log(`\n   Token: ${tokenAddress}`);
        console.log(`   📥 Onchain Deposit (L1 - Initial):`);
        console.log(`      - ${onchainDeposit.toString()} wei`);
        console.log(`      - ${onchainWTON.toString()} WTON`);
        console.log(`      - ${onchainRAY.toString()} RAY`);
        console.log(`   📊 State Snapshot Balance (L2 - After Transactions):`);
        console.log(`      - ${snapshotBalance.toString()} wei`);
        console.log(`      - ${snapshotWTON.toString()} WTON`);
        console.log(`      - ${snapshotRAY.toString()} RAY`);

        // Note: These may differ if L2 transactions have occurred
        if (snapshotBalance === onchainDeposit) {
          console.log(`   ✅ Match! (L2 balance equals initial L1 deposit - no transactions occurred)`);
        } else {
          const diff =
            snapshotBalance > onchainDeposit ? snapshotBalance - onchainDeposit : onchainDeposit - snapshotBalance;
          const diffWTON = diff / BigInt(10 ** 18);
          const diffRAY = diff / BigInt(10 ** 27);
          console.log(
            `   ℹ️  Difference: ${diff.toString()} wei (${diffWTON.toString()} WTON, ${diffRAY.toString()} RAY)`,
          );
          if (snapshotBalance > onchainDeposit) {
            console.log(`      → L2 balance is higher (received tokens in L2 channel)`);
          } else {
            console.log(`      → L2 balance is lower (sent tokens in L2 channel)`);
          }
        }
      }
    }

    console.log('\n' + '─'.repeat(70));

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    All Tests Passed!                        ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
  } catch (e: any) {
    console.error('❌ Test failed:', e.message);
    console.error('Stack:', e.stack);
    throw e;
  }
}

testTokenBalances()
  .then(() => {
    console.log('🎉 Success!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Test failed:', error.message);
    process.exit(1);
  });
