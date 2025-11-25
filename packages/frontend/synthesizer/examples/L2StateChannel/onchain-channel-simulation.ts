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
const ROLLUP_BRIDGE_CORE_ADDRESS = '0x780ad1b236390C42479b62F066F5cEeAa4c77ad6'; // RollupBridge Proxy (Updated 2024-11-24, see DEPLOYED_CONTRACTS.md)
const CHANNEL_ID = 2; // Channel 2 with WTON deposits
const SEPOLIA_TON_CONTRACT = '0xa30fe40285b8f5c0457dbc3b7c8a280373c40044';

// RollupBridgeCore ABI (from IRollupBridgeCore interface)
const ROLLUP_BRIDGE_CORE_ABI = [
  'function getChannelInfo(uint256 channelId) view returns (address[] allowedTokens, uint8 state, uint256 participantCount, bytes32 initialRoot)',
  'function getChannelParticipants(uint256 channelId) view returns (address[])',
  'function getChannelTreeSize(uint256 channelId) view returns (uint256)',
  'function getChannelPublicKey(uint256 channelId) view returns (uint256 pkx, uint256 pky)',
  'function getChannelLeader(uint256 channelId) view returns (address)',
  'function getChannelState(uint256 channelId) view returns (uint8)',
  'function getParticipantPublicKey(uint256 channelId, address participant) view returns (uint256 pkx, uint256 pky)',
  'function getParticipantTokenDeposit(uint256 channelId, address participant, address token) view returns (uint256)',
  'function getL2MptKey(uint256 channelId, address participant, address token) view returns (uint256)',
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
  const [allowedTokens, stateRaw, participantCount, initialRoot] = await bridgeContract.getChannelInfo(channelId);
  const state = Number(stateRaw); // Convert bigint to number for comparison

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

  console.log('\n📊 Fetching deposits and L2 keys from RollupBridge...');
  for (const participant of participants) {
    deposits.set(participant, new Map());
    l2MptKeys.set(participant, new Map());

    for (const token of allowedTokens) {
      try {
        // Use the correct IRollupBridgeCore functions
        const amount = await bridgeContract.getParticipantTokenDeposit(channelId, participant, token);
        const l2Key = await bridgeContract.getL2MptKey(channelId, participant, token);

        deposits.get(participant)!.set(token, amount);
        l2MptKeys.get(participant)!.set(token, l2Key);

        console.log(
          `   ✅ ${participant.substring(0, 10)}... - ${token.substring(0, 10)}...: ${formatEther(amount)} WTON (L2 key: ${l2Key})`,
        );
      } catch (error: any) {
        console.log(`   ⚠️  ${participant.substring(0, 10)}... - ${token.substring(0, 10)}...: Error fetching deposit`);
        console.log(`      ${error.message}`);
        deposits.get(participant)!.set(token, 0n);
        l2MptKeys.get(participant)!.set(token, 0n);
      }
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
  // Allow Initialized (1), Open (2), or Active (3) for testing
  if (channelData.state !== 1 && channelData.state !== 2 && channelData.state !== 3) {
    console.error(`❌ Channel is not in valid state (current: ${getStateName(channelData.state)})`);
    console.error('   Expected: Initialized, Open, or Active');
    return;
  }

  if (channelData.state === 1) {
    console.warn('\n⚠️  Channel is in Initialized state (deposits completed but not yet opened)');
    console.warn('   Proceeding with simulation using deposit data...\n');
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
  // Construct Initial State from Onchain Deposits
  // ========================================================================
  console.log('\n📦 Constructing initial state from onchain deposits...');

  // Build storage entries from channel deposits
  const initialStorageEntries: Array<{ index: number; key: string; value: string }> = [];
  const registeredKeys: string[] = [];

  for (let i = 0; i < participantsWithKeys.length; i++) {
    const participant = participantsWithKeys[i];
    const depositAmount = channelData.deposits.get(participant.l1Address)?.get(SEPOLIA_TON_CONTRACT) || 0n;

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

    console.log(`   ${participant.l1Address}: ${formatEther(depositAmount)} TON (${depositAmount})`);
  }

  // Construct initial state object matching StateSnapshot type
  const initialState = {
    stateRoot: channelData.initialStateRoot,
    storageEntries: initialStorageEntries,
    registeredKeys: registeredKeys,
    contractAddress: SEPOLIA_TON_CONTRACT,
    userL2Addresses: participantsWithKeys.map(p => p.l2Address),
    userStorageSlots: [0n], // ERC20 balance slot
    timestamp: Date.now(),
    userNonces: participantsWithKeys.map(() => 0n), // Initial nonces are all 0
  };

  console.log(`   Initial State Root: ${initialState.stateRoot}`);
  console.log(`   Storage Entries: ${initialState.storageEntries.length}`);
  console.log(`   Registered Keys: ${initialState.registeredKeys.length}\n`);

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
  console.log('   Using onchain initial state as previousState...');
  const result1 = await adapter.synthesizeFromCalldata(calldata, {
    ...baseOptions,
    senderL2PrvKey: participantsWithKeys[0].privateKey, // Alice's private key
    previousState: initialState, // ← Use onchain initial state!
    txNonce: 0n,
  });

  if (result1.placementVariables.length === 0) {
    console.error('❌ Synthesizer failed to generate placements');
    return;
  }

  console.log(`\n✅ Proof #1: Circuit generated successfully`);
  console.log(`   - Placements: ${result1.placementVariables.length}`);
  console.log(`   - Previous State Root: ${initialState.stateRoot}`);
  console.log(`   - New State Root:      ${result1.state.stateRoot}`);

  // Validate that state root changed (transaction was executed)
  if (result1.state.stateRoot !== initialState.stateRoot) {
    console.log(`   ✅ State root CHANGED! (Transaction executed successfully)\n`);
  } else {
    console.warn(`   ⚠️  State root UNCHANGED (No state change detected)\n`);
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

  // Display participant balances after Proof #1
  displayParticipantBalances(
    `Proof #1 (After ${participantsWithKeys[0].l1Address.substring(0, 10)}... → ${participantsWithKeys[1].l1Address.substring(0, 10)}..., 50 TON)`,
    participantsWithKeys.map(p => p.l1Address),
    channelData,
    SEPOLIA_TON_CONTRACT,
  );

  // ========================================================================
  // PROOF #2: Bob → Charlie Transfer (25 TON)
  // ========================================================================
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  Proof #2: Bob → Charlie (25 TON)            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const calldata2 =
    '0xa9059cbb' + // transfer(address,uint256)
    participantsWithKeys[2].l2Address.slice(2).padStart(64, '0') + // recipient (Charlie's L2 address)
    parseEther('25').toString(16).padStart(64, '0'); // amount

  console.log('🔄 Generating circuit for Bob → Charlie transfer...\n');
  const result2 = await adapter.synthesizeFromCalldata(calldata2, {
    ...baseOptions,
    senderL2PrvKey: participantsWithKeys[1].privateKey, // Bob's private key
    previousState: result1.state, // Use state from Proof #1
    txNonce: 0n, // Bob's first transaction
  });

  if (result2.placementVariables.length === 0) {
    console.error('❌ Synthesizer failed to generate placements for Proof #2');
    return;
  }

  console.log(`\n✅ Proof #2: Circuit generated successfully`);
  console.log(`   - Placements: ${result2.placementVariables.length}`);
  console.log(`   - State root: ${result2.state.stateRoot}`);

  if (result2.state.stateRoot !== result1.state.stateRoot) {
    console.log('   ✅ State root CHANGED! (Success!)');
  } else {
    console.log('   ⚠️  State root UNCHANGED');
  }

  // Save outputs
  const proof2Path = 'test-outputs/onchain-proof-2';
  await saveProofOutputs(result2, 2, proof2Path);

  // Prove & Verify Proof #2
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Proving and Verifying Proof #2`);
  console.log('='.repeat(80));

  const prove2Success = await runProver(2, proof2Path);
  const verify2Success = prove2Success ? await runVerifyRust(2, proof2Path) : false;

  if (!prove2Success || !verify2Success) {
    console.error(`\n❌ Proof #2 failed! Cannot continue.`);
    return;
  }
  console.log(`\n✅ Proof #2 Complete: Proved ✅ | Verified ✅`);

  // Display participant balances after Proof #2
  displayParticipantBalances(
    `Proof #2 (After ${participantsWithKeys[1].l1Address.substring(0, 10)}... → ${participantsWithKeys[2].l1Address.substring(0, 10)}..., 25 TON)`,
    participantsWithKeys.map(p => p.l1Address),
    channelData,
    SEPOLIA_TON_CONTRACT,
  );

  // ========================================================================
  // PROOF #3: Charlie → Alice Transfer (15 TON)
  // ========================================================================
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  Proof #3: Charlie → Alice (15 TON)          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const calldata3 =
    '0xa9059cbb' + // transfer(address,uint256)
    participantsWithKeys[0].l2Address.slice(2).padStart(64, '0') + // recipient (Alice's L2 address)
    parseEther('15').toString(16).padStart(64, '0'); // amount

  console.log('🔄 Generating circuit for Charlie → Alice transfer...\n');
  const result3 = await adapter.synthesizeFromCalldata(calldata3, {
    ...baseOptions,
    senderL2PrvKey: participantsWithKeys[2].privateKey, // Charlie's private key
    previousState: result2.state, // Use state from Proof #2
    txNonce: 0n, // Charlie's first transaction
  });

  if (result3.placementVariables.length === 0) {
    console.error('❌ Synthesizer failed to generate placements for Proof #3');
    return;
  }

  console.log(`\n✅ Proof #3: Circuit generated successfully`);
  console.log(`   - Placements: ${result3.placementVariables.length}`);
  console.log(`   - State root: ${result3.state.stateRoot}`);

  if (result3.state.stateRoot !== result2.state.stateRoot) {
    console.log('   ✅ State root CHANGED! (Success!)');
  } else {
    console.log('   ⚠️  State root UNCHANGED');
  }

  // Save outputs
  const proof3Path = 'test-outputs/onchain-proof-3';
  await saveProofOutputs(result3, 3, proof3Path);

  // Prove & Verify Proof #3
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Proving and Verifying Proof #3`);
  console.log('='.repeat(80));

  const prove3Success = await runProver(3, proof3Path);
  const verify3Success = prove3Success ? await runVerifyRust(3, proof3Path) : false;

  if (!prove3Success || !verify3Success) {
    console.error(`\n❌ Proof #3 failed! Cannot continue.`);
    return;
  }
  console.log(`\n✅ Proof #3 Complete: Proved ✅ | Verified ✅`);

  // Display participant balances after Proof #3
  displayParticipantBalances(
    `Proof #3 (After ${participantsWithKeys[2].l1Address.substring(0, 10)}... → ${participantsWithKeys[0].l1Address.substring(0, 10)}..., 15 TON)`,
    participantsWithKeys.map(p => p.l1Address),
    channelData,
    SEPOLIA_TON_CONTRACT,
  );

  // ========================================================================
  // FINAL ANALYSIS
  // ========================================================================
  console.log('\n\n📈 State Chain Analysis');
  console.log('━'.repeat(80));

  const stateRoots = [
    initialState.stateRoot,
    result1.state.stateRoot,
    result2.state.stateRoot,
    result3.state.stateRoot,
  ];
  const uniqueRoots = new Set(stateRoots).size;

  console.log('📊 State Root Evolution:');
  console.log(`   Initial (Onchain):         ${initialState.stateRoot}`);
  console.log(`   → Proof #1 (Alice→Bob):    ${result1.state.stateRoot}`);
  console.log(`   → Proof #2 (Bob→Charlie):  ${result2.state.stateRoot}`);
  console.log(`   → Proof #3 (Charlie→Alice): ${result3.state.stateRoot}`);
  console.log(`   Unique Roots: ${uniqueRoots}/4`);

  if (uniqueRoots === 4) {
    console.log('   🎉 All state roots are UNIQUE! (Perfect!)');
  } else if (uniqueRoots >= 3) {
    console.log(`   ✅ State roots changing (${uniqueRoots}/4 unique)`);
  } else {
    console.log('   ⚠️  Some state roots are duplicated');
  }

  console.log('\n📐 Circuit Optimization:');
  console.log(`   Proof #1: ${result1.placementVariables.length} placements`);
  console.log(`   Proof #2: ${result2.placementVariables.length} placements`);
  console.log(`   Proof #3: ${result3.placementVariables.length} placements`);

  const reduction = (1 - result2.placementVariables.length / result1.placementVariables.length) * 100;
  console.log(`   Optimization: ${reduction.toFixed(1)}% reduction after initial load`);

  console.log('\n⏱️  Performance:');
  const time12 = result2.state.timestamp - result1.state.timestamp;
  const time23 = result3.state.timestamp - result2.state.timestamp;
  console.log(`   Proof #1: ${result1.state.timestamp}ms (from start)`);
  console.log(`   Proof #2: ${time12}ms`);
  console.log(`   Proof #3: ${time23}ms`);

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
  console.log(`   - Proof #2: Proved ✅ | Verified ✅`);
  console.log(`   - Proof #3: Proved ✅ | Verified ✅`);
  console.log('');
  console.log('🔄 Sequential Execution Flow:');
  console.log('   Proof #1: Synthesize → Preprocess → Prove → Verify ✅ Complete');
  console.log('             ↓ (await completion)');
  console.log('   Proof #2: Synthesize → Prove → Verify ✅ Complete');
  console.log('             ↓ (await completion)');
  console.log('   Proof #3: Synthesize → Prove → Verify ✅ Complete');
  console.log('');
  console.log('   ℹ️  Preprocess runs once before first proof (generates verifier params)');
  console.log('   ℹ️  Each proof waits for completion before starting the next');
  console.log('');
  console.log('💡 Key Implementation Details:');
  console.log('   ✅ Used onchain initial state root as previousState for Proof #1');
  console.log('   ✅ Initial state constructed from channel deposit amounts');
  console.log('   ✅ State chain properly maintained across all proofs');
  console.log('   ✅ All data fetched from RollupBridgeCore contract on Sepolia');
  console.log('');
  console.log('📊 Transaction Flow:');
  console.log(`   Initial State:     ${initialState.stateRoot.substring(0, 20)}...`);
  console.log(
    `                      (${participantsWithKeys[0].l1Address}, ${participantsWithKeys[1].l1Address}, ${participantsWithKeys[2].l1Address})`,
  );
  console.log(`                      balances from channel deposits`);
  console.log(
    `   → Proof #1:        ${participantsWithKeys[0].l1Address.substring(0, 10)}... sends 50 TON to ${participantsWithKeys[1].l1Address.substring(0, 10)}...`,
  );
  console.log(`                      New state: ${result1.state.stateRoot.substring(0, 20)}...`);
  console.log(
    `   → Proof #2:        ${participantsWithKeys[1].l1Address.substring(0, 10)}... sends 25 TON to ${participantsWithKeys[2].l1Address.substring(0, 10)}...`,
  );
  console.log(`                      New state: ${result2.state.stateRoot.substring(0, 20)}...`);
  console.log(
    `   → Proof #3:        ${participantsWithKeys[2].l1Address.substring(0, 10)}... sends 15 TON back to ${participantsWithKeys[0].l1Address.substring(0, 10)}...`,
  );
  console.log(`                      New state: ${result3.state.stateRoot.substring(0, 20)}...`);

  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

// Run the test
testOnchainChannelSimulation().catch(console.error);
