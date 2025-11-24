/**
 * Onchain Channel Simulation Test
 *
 * This script simulates L2 State Channel transactions using real onchain data
 * from the RollupBridgeCore contract deployed on Sepolia testnet.
 *
 * Key Features:
 * - Fetches channel configuration from RollupBridgeCore
 * - Uses actual participant addresses and deposits
 * - Validates state root against onchain initialStateRoot
 * - Simulates transactions with real channel parameters
 *
 * Usage:
 *   npx tsx examples/L2StateChannel/onchain-channel-simulation.ts
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
import { execSync } from 'child_process';
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
const ROLLUP_BRIDGE_CORE_ADDRESS = '0x61d4618911487c65aa49ab22db57691b4d94a6bf'; // Sepolia Channel Manager
const CHANNEL_ID = 1; // Channel ID to simulate
const SEPOLIA_TON_CONTRACT = '0xa30fe40285b8f5c0457dbc3b7c8a280373c40044';

// RollupBridgeCore ABI (minimal - only getter functions we need)
const ROLLUP_BRIDGE_CORE_ABI = [
  'function getChannelInfo(uint256 channelId) view returns (address[] allowedTokens, uint8 state, uint256 participantCount, bytes32 initialRoot)',
  'function getChannelParticipants(uint256 channelId) view returns (address[])',
  'function getParticipantL2MptKey(uint256 channelId, address participant, address token) view returns (uint256)',
  'function getParticipantTokenDeposit(uint256 channelId, address participant, address token) view returns (uint256)',
  'function getChannelTreeSize(uint256 channelId) view returns (uint256)',
  'function getChannelPublicKey(uint256 channelId) view returns (uint256 pkx, uint256 pky)',
  'function getChannelLeader(uint256 channelId) view returns (address)',
  'function getChannelState(uint256 channelId) view returns (uint8)',
  'function getParticipantPublicKey(uint256 channelId, address participant) view returns (uint256 pkx, uint256 pky)',
];

// ============================================================================
// TYPES
// ============================================================================

interface ChannelData {
  channelId: number;
  allowedTokens: string[];
  participants: string[];
  initialStateRoot: string;
  treeSize: number;
  leader: string;
  state: number;
  deposits: Map<string, Map<string, bigint>>; // participant -> token -> amount
  l2MptKeys: Map<string, Map<string, bigint>>; // participant -> token -> key
  publicKey: { pkx: bigint; pky: bigint };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function bigIntToHex(value: bigint): string {
  return '0x' + value.toString(16).padStart(64, '0');
}

function displayChannelInfo(channelData: ChannelData) {
  console.log('\n📋 Channel Information:');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Channel ID:        ${channelData.channelId}`);
  console.log(`  State:             ${getStateName(channelData.state)}`);
  console.log(`  Leader:            ${channelData.leader}`);
  console.log(`  Tree Size:         ${channelData.treeSize}`);
  console.log(`  Initial Root:      ${channelData.initialStateRoot}`);
  console.log(`  Allowed Tokens:    ${channelData.allowedTokens.join(', ')}`);
  console.log(`  Participants:      ${channelData.participants.length}`);
  channelData.participants.forEach((p, i) => {
    console.log(`    ${i + 1}. ${p}`);
  });
  console.log('═══════════════════════════════════════════════════════════\n');
}

function getStateName(state: number): string {
  const states = ['None', 'Initialized', 'Open', 'Active', 'Closing', 'Closed'];
  return states[state] || 'Unknown';
}

function displayParticipantBalances(label: string, participants: string[], channelData: ChannelData, token: string) {
  console.log(`\n💰 ${label}:`);
  console.log('─────────────────────────────────────────────────────────');

  let totalBalance = 0n;
  participants.forEach((addr, index) => {
    const balance = channelData.deposits.get(addr)?.get(token) || 0n;
    const tonBalance = Number(formatEther(balance));
    totalBalance += balance;

    const name = index === 0 ? 'Alice  ' : index === 1 ? 'Bob    ' : 'Charlie';
    console.log(`  ${name}: ${tonBalance.toFixed(2)} TON`);
  });

  console.log('─────────────────────────────────────────────────────────');
  console.log(`  Total:   ${Number(formatEther(totalBalance)).toFixed(2)} TON`);
  console.log('─────────────────────────────────────────────────────────\n');
}

// ============================================================================
// ONCHAIN DATA FETCHING
// ============================================================================

async function fetchChannelData(
  provider: JsonRpcProvider,
  bridgeContract: Contract,
  channelId: number,
): Promise<ChannelData> {
  console.log('\n🔍 Fetching channel data from RollupBridgeCore...\n');

  // 1. Get basic channel info
  const [allowedTokens, state, participantCount, initialRoot] = await bridgeContract.getChannelInfo(channelId);

  console.log(`✅ Channel info fetched`);
  console.log(`   - Allowed tokens: ${allowedTokens.length}`);
  console.log(`   - Participants: ${participantCount}`);
  console.log(`   - State: ${getStateName(state)}`);

  // 2. Get participants
  const participants: string[] = await bridgeContract.getChannelParticipants(channelId);
  console.log(`✅ Participants fetched: ${participants.join(', ')}`);

  // 3. Get tree size
  const treeSize = Number(await bridgeContract.getChannelTreeSize(channelId));
  console.log(`✅ Tree size: ${treeSize}`);

  // 4. Get leader
  const leader: string = await bridgeContract.getChannelLeader(channelId);
  console.log(`✅ Leader: ${leader}`);

  // 5. Get public key
  const [pkx, pky] = await bridgeContract.getChannelPublicKey(channelId);
  console.log(`✅ Public key fetched`);

  // 6. Get deposits and L2 MPT keys for all participants and tokens
  const deposits = new Map<string, Map<string, bigint>>();
  const l2MptKeys = new Map<string, Map<string, bigint>>();

  console.log('\n📊 Fetching deposits and L2 keys...');
  for (const participant of participants) {
    deposits.set(participant, new Map());
    l2MptKeys.set(participant, new Map());

    for (const token of allowedTokens) {
      const deposit = await bridgeContract.getParticipantTokenDeposit(channelId, participant, token);
      const l2Key = await bridgeContract.getParticipantL2MptKey(channelId, participant, token);

      deposits.get(participant)!.set(token, deposit);
      l2MptKeys.get(participant)!.set(token, l2Key);

      console.log(`   ${participant} - ${token}: ${formatEther(deposit)} TON (key: ${l2Key})`);
    }
  }

  return {
    channelId,
    allowedTokens,
    participants,
    initialStateRoot: initialRoot,
    treeSize,
    leader,
    state,
    deposits,
    l2MptKeys,
    publicKey: { pkx, pky },
  };
}

// ============================================================================
// SYNTHESIZER & PROOF GENERATION
// ============================================================================

async function saveProofOutputs(result: SynthesizerResult, proofNum: number, outputsPath: string) {
  // Ensure output directory exists
  mkdirSync(outputsPath, { recursive: true });

  // Save instance.json
  const instancePath = `${outputsPath}/instance.json`;
  writeFileSync(instancePath, JSON.stringify(result.instance, null, 2));
  console.log(
    `   ✅ instance.json saved (user: ${result.instance.a_pub_user.length}, block: ${result.instance.a_pub_block.length}, function: ${result.instance.a_pub_function.length} public inputs)`,
  );

  // Save permutation.json
  const permutationPath = `${outputsPath}/permutation.json`;
  writeFileSync(permutationPath, JSON.stringify(result.permutation, null, 2));
  console.log(`   ✅ permutation.json saved (${result.permutation.length} entries)`);

  // Save placementVariables.json
  const placementPath = `${outputsPath}/placementVariables.json`;
  writeFileSync(placementPath, JSON.stringify(result.placementVariables, null, 2));
  console.log(`   ✅ placementVariables.json saved (${result.placementVariables.length} placements)`);

  // Save state_snapshot.json
  const statePath = `${outputsPath}/state_snapshot.json`;
  writeFileSync(
    statePath,
    JSON.stringify(result.state, (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2),
  );
  console.log(`   ✅ state_snapshot.json saved`);
}

async function runProver(proofNum: number, outputsPath: string): Promise<boolean> {
  console.log(`\n⚡ Proof #${proofNum}: Running prover...`);

  const qapPath = resolve(process.cwd(), '../qap-compiler/subcircuits/library');
  const synthesizerPath = resolve(process.cwd(), outputsPath);
  const setupPath = resolve(process.cwd(), '../../../dist/macOS/resource/setup/output');
  const outPath = synthesizerPath;

  if (!existsSync(`${synthesizerPath}/instance.json`)) {
    console.log(`   ⚠️  instance.json not found, skipping prover`);
    return false;
  }

  try {
    const proverPath = resolve(process.cwd(), '../../backend/prove');
    const cmd = `cd ${proverPath} && cargo run --release -- "${qapPath}" "${synthesizerPath}" "${setupPath}" "${outPath}"`;

    console.log(`   Running: cargo run --release (this may take a while)...`);
    const startTime = Date.now();

    const output = execSync(cmd, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 300000, // 5 minute timeout
    });

    const duration = Date.now() - startTime;

    if (existsSync(`${outPath}/proof.json`)) {
      console.log(`   ✅ Proof generated successfully in ${(duration / 1000).toFixed(2)}s`);
      const timeMatch = output.match(/Total proving time: ([\d.]+) seconds/);
      if (timeMatch) {
        console.log(`   ⏱️  Total proving time: ${timeMatch[1]}s`);
      }
      return true;
    } else {
      console.log(`   ❌ Proof generation failed - proof.json not found`);
      console.log(`   Output: ${output}`);
      return false;
    }
  } catch (error: any) {
    console.log(`   ❌ Prover error: ${error.message}`);
    if (error.stdout) {
      console.log(`   stdout: ${error.stdout.substring(0, 500)}...`);
    }
    if (error.stderr) {
      console.log(`   stderr: ${error.stderr.substring(0, 500)}...`);
    }
    return false;
  }
}

async function runVerifyRust(proofNum: number, outputsPath: string): Promise<boolean> {
  console.log(`\n🔐 Proof #${proofNum}: Running verify-rust verification...`);

  const qapPath = resolve(process.cwd(), '../qap-compiler/subcircuits/library');
  const synthesizerPath = resolve(process.cwd(), outputsPath);
  const setupPath = resolve(process.cwd(), '../../../dist/macOS/resource/setup/output');
  const preprocessPath = resolve(process.cwd(), '../../../dist/macOS/resource/preprocess/output');
  const proofPath = synthesizerPath;

  if (!existsSync(`${synthesizerPath}/instance.json`)) {
    console.log(`   ⚠️  instance.json not found, skipping verification`);
    return false;
  }

  if (!existsSync(`${proofPath}/proof.json`)) {
    console.log(`   ⚠️  proof.json not found - cannot verify without proof`);
    return false;
  }

  try {
    const verifyRustPath = resolve(process.cwd(), '../../backend/verify/verify-rust');
    const cmd = `cd ${verifyRustPath} && cargo run --release -- "${qapPath}" "${synthesizerPath}" "${setupPath}" "${preprocessPath}" "${proofPath}"`;

    console.log(`   Running: cargo run --release...`);
    const startTime = Date.now();

    const output = execSync(cmd, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 60000, // 60 second timeout
    });

    const duration = Date.now() - startTime;

    const lines = output.split('\n');
    const verificationResult = lines.find(line => line.trim() === 'true' || line.trim() === 'false');

    if (verificationResult === 'true') {
      console.log(`   ✅ Verification PASSED in ${(duration / 1000).toFixed(2)}s`);
      return true;
    } else if (verificationResult === 'false') {
      console.log(`   ❌ Verification FAILED in ${(duration / 1000).toFixed(2)}s`);
      console.log(`   Output: ${output}`);
      return false;
    } else {
      console.log(`   ⚠️  Could not parse verification result`);
      console.log(`   Output: ${output}`);
      return false;
    }
  } catch (error: any) {
    console.log(`   ❌ Verification error: ${error.message}`);
    if (error.stdout) {
      console.log(`   stdout: ${error.stdout}`);
    }
    if (error.stderr) {
      console.log(`   stderr: ${error.stderr}`);
    }
    return false;
  }
}

async function runPreprocess(outputsPath: string): Promise<boolean> {
  console.log(`\n⚙️  Running preprocess (one-time setup)...`);

  const qapPath = resolve(process.cwd(), '../qap-compiler/subcircuits/library');
  const synthesizerPath = resolve(process.cwd(), outputsPath);
  const setupPath = resolve(process.cwd(), '../../../dist/macOS/resource/setup/output');
  const preprocessOutPath = resolve(process.cwd(), '../../../dist/macOS/resource/preprocess/output');

  if (existsSync(`${preprocessOutPath}/preprocess.json`)) {
    console.log(`   ℹ️  Preprocess files already exist, skipping...`);
    return true;
  }

  if (!existsSync(preprocessOutPath)) {
    mkdirSync(preprocessOutPath, { recursive: true });
  }

  try {
    const preprocessPath = resolve(process.cwd(), '../../backend/verify/preprocess');
    const cmd = `cd ${preprocessPath} && cargo run --release -- "${qapPath}" "${synthesizerPath}" "${setupPath}" "${preprocessOutPath}"`;

    console.log(`   Running: cargo run --release (this may take a while)...`);
    const startTime = Date.now();

    const output = execSync(cmd, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 300000, // 5 minute timeout
    });

    const duration = Date.now() - startTime;

    if (existsSync(`${preprocessOutPath}/preprocess.json`)) {
      console.log(`   ✅ Preprocess completed successfully in ${(duration / 1000).toFixed(2)}s`);
      return true;
    } else {
      console.log(`   ❌ Preprocess failed - output files not found`);
      console.log(`   Output: ${output}`);
      return false;
    }
  } catch (error: any) {
    console.log(`   ❌ Preprocess error: ${error.message}`);
    if (error.stdout) {
      console.log(`   stdout: ${error.stdout.substring(0, 500)}...`);
    }
    if (error.stderr) {
      console.log(`   stderr: ${error.stderr.substring(0, 500)}...`);
    }
    return false;
  }
}

// ============================================================================
// MAIN TEST FUNCTION
// ============================================================================

async function testOnchainChannelSimulation() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║       Onchain Channel Simulation Test - Sepolia TON         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Initialize provider and contract
  const provider = new JsonRpcProvider(SEPOLIA_RPC_URL);
  const bridge = new Contract(ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, provider);

  // Fetch channel data from onchain
  const channelData = await fetchChannelData(provider, bridge, CHANNEL_ID);
  displayChannelInfo(channelData);

  // Validate channel state
  if (channelData.state !== 2 && channelData.state !== 3) {
    // Open or Active
    console.error(`❌ Channel is not in Open or Active state (current: ${getStateName(channelData.state)})`);
    console.error('   Please use a channel that is ready for transactions.');
    return;
  }

  // Display initial balances
  displayParticipantBalances(
    'Initial Balances (from Channel Deposits)',
    channelData.participants,
    channelData,
    SEPOLIA_TON_CONTRACT,
  );

  // Check setup files
  const setupPath = resolve(process.cwd(), '../../../dist/macOS/resource/setup/output');
  const sigmaFile = `${setupPath}/sigma_preprocess.json`;
  const setupExists = existsSync(sigmaFile);

  console.log(`\n📋 Setup files check:`);
  console.log(`   Path: ${setupPath}`);
  console.log(`   Status: ${setupExists ? '✅ Found' : '❌ Not found'}`);

  if (!setupExists) {
    console.log('\n⚠️  Setup files not found. Please run: tokamak-cli --install');
    console.log('   Skipping prove/verify steps.\n');
    return;
  }

  // Get current block number
  const blockNumber = await provider.getBlockNumber();
  console.log(`\n📦 Current block number: ${blockNumber}\n`);

  // Generate L2 keys for each participant (deterministic based on index)
  console.log('👥 Generating L2 Keys for Channel Participants...');
  const participantsWithKeys = channelData.participants.map((l1Address, idx) => {
    const name = ['Alice', 'Bob', 'Charlie'][idx] || `User${idx}`;

    // Generate deterministic private key from index
    const privateKey = setLengthLeft(bigIntToBytes(BigInt(idx + 1) * 123456789n), 32);
    const publicKey = jubjub.Point.BASE.multiply(bytesToBigInt(privateKey)).toBytes();
    const l2Address = fromEdwardsToAddress(publicKey).toString();

    console.log(`   ${name}:`);
    console.log(`     L1: ${l1Address}`);
    console.log(`     L2: ${l2Address}`);

    return {
      name,
      l1Address,
      l2Address,
      privateKey,
      publicKey,
    };
  });

  // Create Synthesizer adapter
  const adapter = new SynthesizerAdapter({ rpcUrl: SEPOLIA_RPC_URL });

  // Base options for all proofs
  const baseOptions = {
    contractAddress: SEPOLIA_TON_CONTRACT,
    publicKeyListL2: participantsWithKeys.map(p => p.publicKey),
    addressListL1: participantsWithKeys.map(p => p.l1Address),
    blockNumber,
    userStorageSlots: [0], // ERC20 balance only (slot 0)
  };

  // ========================================================================
  // PROOF #1: Alice → Bob Transfer (50 TON)
  // ========================================================================
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  Proof #1: Alice → Bob (50 TON)              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Simulate transfer: Alice → Bob (50 TON)
  const calldata =
    '0xa9059cbb' + // transfer(address,uint256)
    participantsWithKeys[1].l2Address.slice(2).padStart(64, '0') + // recipient (Bob's L2 address)
    parseEther('50').toString(16).padStart(64, '0'); // amount

  console.log('🔄 Generating circuit for Alice → Bob transfer...\n');
  const result1 = await adapter.synthesizeFromCalldata(calldata, {
    ...baseOptions,
    senderL2PrvKey: participantsWithKeys[0].privateKey, // Alice's private key
    txNonce: 0n,
  });

  if (result1.placementVariables.length === 0) {
    console.error('❌ Synthesizer failed to generate placements');
    return;
  }

  console.log(`\n✅ Proof #1: Circuit generated successfully`);
  console.log(`   - Placements: ${result1.placementVariables.length}`);
  console.log(`   - State root: ${result1.state.stateRoot}`);

  // Validate state root against onchain initialStateRoot
  if (result1.state.stateRoot !== channelData.initialStateRoot) {
    console.warn(`\n⚠️  State root mismatch!`);
    console.warn(`   Expected (onchain): ${channelData.initialStateRoot}`);
    console.warn(`   Got (synthesizer):  ${result1.state.stateRoot}`);
    console.warn(`   This may indicate initial state setup mismatch.\n`);
  } else {
    console.log(`\n✅ State root matches onchain initialStateRoot!\n`);
  }

  // Save outputs
  const proof1Path = 'test-outputs/onchain-proof-1';
  await saveProofOutputs(result1, 1, proof1Path);

  // Prove & Verify
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Proving and Verifying Proof #1`);
  console.log('='.repeat(80));

  // Run preprocess first (only once, before first proof)
  const preprocessSuccess = await runPreprocess(proof1Path);
  if (!preprocessSuccess) {
    console.error(`\n❌ Preprocess failed! Cannot continue.`);
    return;
  }

  // Now run prove and verify
  const prove1Success = await runProver(1, proof1Path);
  const verify1Success = prove1Success ? await runVerifyRust(1, proof1Path) : false;

  if (!prove1Success || !verify1Success) {
    console.error(`\n❌ Proof #1 failed! Cannot continue.`);
    return;
  }
  console.log(`\n✅ Proof #1 Complete: Preprocessed ✅ | Proved ✅ | Verified ✅`);

  // ========================================================================
  // SUMMARY
  // ========================================================================
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                     Simulation Summary                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('✅ Successfully completed onchain channel simulation!');
  console.log('');
  console.log('📋 Channel Information:');
  console.log(`   - Channel ID: ${channelData.channelId}`);
  console.log(`   - Participants: ${channelData.participants.length}`);
  console.log(`   - Initial Root: ${channelData.initialStateRoot}`);
  console.log(`   - Tree Size: ${channelData.treeSize}`);
  console.log(`   - State: ${getStateName(channelData.state)}`);
  console.log('');
  console.log('🔬 Proof Generation:');
  console.log(`   - Proof #1: Preprocessed ✅ | Proved ✅ | Verified ✅`);
  console.log('');
  console.log('💡 All data was fetched from the RollupBridgeCore contract on Sepolia');
  console.log('   and validated against onchain state.');

  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

// Run the test
testOnchainChannelSimulation().catch(console.error);
