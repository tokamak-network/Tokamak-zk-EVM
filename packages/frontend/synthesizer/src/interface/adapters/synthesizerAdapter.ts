/**
 * Synthesizer Adapter - Browser/Node.js compatible
 * Generates instance.json from Ethereum transactions using RPC state
 *
 * Updated to work with the new Synthesizer architecture:
 * - Uses createSynthesizerOptsForSimulationFromRPC()
 * - Uses createSynthesizer() and synthesizer.synthesizeTX()
 * - Uses createCircuitGenerator() for output generation
 */

import { ethers } from 'ethers';
import { jubjub } from '@noble/curves/misc';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import {
  bytesToBigInt,
  bigIntToBytes,
  setLengthLeft,
  utf8ToBytes,
  hexToBytes,
  concatBytes,
  addHexPrefix,
  Address,
  toBytes,
  bytesToHex,
} from '@ethereumjs/util';
import { createSynthesizerOptsForSimulationFromRPC, type SynthesizerSimulationOpts } from '../rpc/rpc.ts';
import { createSynthesizer, Synthesizer } from '../../synthesizer/index.ts';
import { createCircuitGenerator } from '../../circuitGenerator/circuitGenerator.ts';
import type { SynthesizerInterface } from '../../synthesizer/types/index.ts';
import { fromEdwardsToAddress } from '../../TokamakL2JS/index.ts';
import { getUserStorageKey } from '../../TokamakL2JS/utils/index.ts';
import type { PublicInstance } from '../../circuitGenerator/types/types.ts';
import { TokamakL2StateManager } from '../../TokamakL2JS/stateManager/TokamakL2StateManager.ts';
import { ROLLUP_BRIDGE_CORE_ABI } from './constants/index.ts';

// StateSnapshot type definition (matches usage in adapter)
export interface StateSnapshot {
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

export interface SynthesizerAdapterConfig {
  rpcUrl: string;
}

/**
 * High-level parameters for L2 State Channel transfer synthesis
 * This is the simplified interface for external callers
 */
export interface SynthesizeL2TransferParams {
  channelId: number;
  initializeTxHash: string;
  senderL2PrvKey: Uint8Array;
  recipientL2Address: string; // L2 address of recipient
  amount: string; // Amount as string (e.g., "1" for 1 TON)
  previousStatePath?: string; // Optional: path to previous state_snapshot.json
  outputPath?: string; // Optional: path for outputs
  rpcUrl?: string; // Optional: RPC URL (defaults to adapter's rpcUrl)
  rollupBridgeAddress?: string; // Optional: RollupBridge contract address (defaults to ROLLUP_BRIDGE_CORE_ADDRESS)
}

/**
 * Result of L2 transfer synthesis
 */
export interface SynthesizeL2TransferResult {
  success: boolean;
  stateRoot: string;
  previousStateRoot: string;
  newStateRoot: string;
  stateSnapshotPath: string; // Path to state_snapshot.json
  outputPath?: string;
  error?: string;
}

export interface SynthesizeOptions {
  previousState?: StateSnapshot; // Optional: previous state to restore from
  outputPath?: string; // Optional: path for file outputs
}

export interface CalldataSynthesizeOptions {
  contractAddress: string; // Contract to call
  senderL2PrvKey: Uint8Array; // Sender's L2 private key
  blockNumber?: number; // Block number for state (default: latest)
  previousState?: StateSnapshot; // Optional: previous state to restore from
  outputPath?: string; // Optional: path for file outputs
  txNonce?: bigint; // Transaction nonce for sender (default: 0n)
  // Channel-specific options (for on-chain state restoration)
  channelId?: number; // Channel ID for fetching on-chain data
  rollupBridgeAddress?: string; // RollupBridge contract address
  rpcUrl?: string; // RPC URL (if different from adapter's rpcUrl)
}

export interface SynthesizerResult {
  instance: PublicInstance;
  placementVariables: any[];
  permutation: {
    row: number;
    col: number;
    X: number;
    Y: number;
  }[];
  state: StateSnapshot; // State snapshot after synthesis
  metadata: {
    txHash?: string; // Optional: only present when synthesized from RPC
    blockNumber: number;
    from: string;
    to: string | null;
    contractAddress: string;
    eoaAddresses: string[];
    calldata?: string; // Optional: hex string of calldata
  };
  executionResult?: {
    success: boolean; // true if transaction executed successfully (no revert)
    gasUsed: bigint; // Total gas spent
    logsCount: number; // Number of logs emitted
    error?: string; // Error message if transaction reverted
  };
}

export class SynthesizerAdapter {
  private rpcUrl: string;
  private provider: ethers.JsonRpcProvider;

  constructor(config: SynthesizerAdapterConfig) {
    this.rpcUrl = config.rpcUrl;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
  }

  /**
   * Fetch channel data from RollupBridge contract
   * Returns participants' L1 addresses and their MPT keys
   */
  async fetchChannelData(
    channelId: number,
    rollupBridgeAddress: string,
    rollupBridgeABI: any[],
  ): Promise<{
    participants: string[];
    registeredKeys: string[];
    storageEntries: Array<{ key: string; value: string }>;
    contractAddress: string;
    preAllocatedLeaves: Array<{ key: string; value: string }>;
    initialRoot: string;
  }> {
    const bridgeContract = new ethers.Contract(rollupBridgeAddress, rollupBridgeABI, this.provider);

    // Get channel info
    const [targetAddress, state, participantCount, initialRoot] = await bridgeContract.getChannelInfo(channelId);
    const participants: string[] = await bridgeContract.getChannelParticipants(channelId);

    // Fetch participants' MPT keys and deposits
    const registeredKeys: string[] = [];
    const storageEntries: Array<{ key: string; value: string }> = [];

    for (let i = 0; i < participants.length; i++) {
      const l1Address = participants[i];
      const onChainMptKeyBigInt = await bridgeContract.getL2MptKey(channelId, l1Address);
      const onChainMptKeyHex = '0x' + onChainMptKeyBigInt.toString(16).padStart(64, '0');
      const deposit = await bridgeContract.getParticipantDeposit(channelId, l1Address);

      registeredKeys.push(onChainMptKeyHex);
      const depositHex = '0x' + deposit.toString(16).padStart(64, '0');
      storageEntries.push({
        key: onChainMptKeyHex,
        value: depositHex,
      });
    }

    // Fetch pre-allocated leaves
    const preAllocatedKeysFromContract = await bridgeContract.getPreAllocatedKeys(targetAddress);
    const preAllocatedLeaves: Array<{ key: string; value: string }> = [];

    for (const key of preAllocatedKeysFromContract) {
      let keyHex: string;
      if (typeof key === 'string') {
        keyHex = key.startsWith('0x') ? key : '0x' + key;
        if (keyHex.length < 66) {
          const hexPart = keyHex.slice(2);
          keyHex = '0x' + hexPart.padStart(64, '0');
        }
      } else {
        keyHex = '0x' + key.toString(16).padStart(64, '0');
      }

      const [value, exists] = await bridgeContract.getPreAllocatedLeaf(targetAddress, key);
      let valueHex: string;
      if (typeof value === 'string') {
        valueHex = value.startsWith('0x') ? value : '0x' + value;
        if (valueHex.length < 66) {
          const hexPart = valueHex.slice(2);
          valueHex = '0x' + hexPart.padStart(64, '0');
        }
      } else {
        valueHex = '0x' + value.toString(16).padStart(64, '0');
      }

      if (exists) {
        preAllocatedLeaves.push({ key: keyHex, value: valueHex });
      }
    }

    return {
      participants,
      registeredKeys,
      storageEntries,
      contractAddress: targetAddress,
      preAllocatedLeaves,
      initialRoot,
    };
  }

  /**
   * Build initStorageKeys from channel data
   * Combines pre-allocated leaves and participants' storage keys
   * L1: participant's L1 address as storage key (to fetch from on-chain)
   * L2: participant's MPT key (actual L2 storage key)
   */
  async buildInitStorageKeys(
    channelId: number,
    rollupBridgeAddress: string,
    preAllocatedLeaves: Array<{ key: string; value: string }>,
  ): Promise<Array<{ L1: Uint8Array; L2: Uint8Array }>> {
    const initStorageKeys: Array<{ L1: Uint8Array; L2: Uint8Array }> = [];

    // Add pre-allocated leaves first
    for (const leaf of preAllocatedLeaves) {
      const keyBytes = hexToBytes(addHexPrefix(leaf.key));
      initStorageKeys.push({
        L1: keyBytes,
        L2: keyBytes,
      });
      }

    // Get participants from on-chain
    const bridgeContract = new ethers.Contract(rollupBridgeAddress, ROLLUP_BRIDGE_CORE_ABI, this.provider);
    const participants: string[] = await bridgeContract.getChannelParticipants(channelId);

    // Add all participants' storage keys
    // L1: participant's L1 address as storage key (to fetch from on-chain)
    // L2: participant's MPT key (actual L2 storage key)
    for (let i = 0; i < participants.length; i++) {
      const l1Address = participants[i];
      // Get MPT key from on-chain using channel ID and L1 address
      const mptKeyBigInt = await bridgeContract.getL2MptKey(channelId, l1Address);
      const mptKeyHex = '0x' + mptKeyBigInt.toString(16).padStart(64, '0');
      const l1StorageKey = getUserStorageKey([l1Address, 0], 'L1'); // L1 storage key from participant address
      const mptKeyBytes = hexToBytes(addHexPrefix(mptKeyHex));
      initStorageKeys.push({
        L1: l1StorageKey,
        L2: mptKeyBytes,
      });
    }

    return initStorageKeys;
  }

  /**
   * Build ERC20 transfer calldata
   * Format: 0xa9059cbb + recipient (32 bytes) + amount (32 bytes)
   */
  static buildTransferCalldata(recipientL2Address: string, amount: bigint): string {
    const calldata =
      '0xa9059cbb' + // transfer(address,uint256) function selector
      recipientL2Address.slice(2).padStart(64, '0') + // recipient address
      amount.toString(16).padStart(64, '0'); // amount
    return calldata;
  }

  /**
   * Synthesize from calldata directly (State Channel mode)
   * Does not require transaction hash or blockchain submission
   *
   * @param calldata - Raw calldata bytes or hex string
   * @param options - Synthesis options including contract address, L2 keys, etc.
   * @returns Instance JSON, placement variables, permutation, state, and metadata
   */
  async synthesizeFromCalldata(
    calldata: Uint8Array | string,
    options: CalldataSynthesizeOptions,
  ): Promise<SynthesizerResult> {
    const { previousState, outputPath, channelId, rollupBridgeAddress, rpcUrl } = options;
    const effectiveRpcUrl = rpcUrl || this.rpcUrl;

    // Normalize calldata to Uint8Array
    const calldataBytes = typeof calldata === 'string' ? hexToBytes(addHexPrefix(calldata)) : calldata;

    console.log('[SynthesizerAdapter] Processing calldata directly (State Channel mode)');
    console.log(`  Contract: ${options.contractAddress}`);
    console.log(`  Calldata: ${addHexPrefix(Buffer.from(calldataBytes).toString('hex'))}`);

    // Get block number (default: latest)
    const blockNumber = options.blockNumber || (await this.provider.getBlockNumber());
    console.log(`  Block: ${blockNumber}`);

    // Build initStorageKeys and store preAllocatedLeaves for final state
    let initStorageKeys: Array<{ L1: Uint8Array; L2: Uint8Array }> = [];
    let preAllocatedLeaves: Array<{ key: string; value: string }> = [];

    if (previousState) {
      // Use previousState to build initStorageKeys
      // For previousState, we need channelId and rollupBridgeAddress to fetch fresh MPT keys
      if (!channelId || !rollupBridgeAddress) {
        throw new Error('channelId and rollupBridgeAddress are required even with previousState to fetch current MPT keys');
      }
      const channelData = await this.fetchChannelData(channelId, rollupBridgeAddress, ROLLUP_BRIDGE_CORE_ABI);
      preAllocatedLeaves = previousState.preAllocatedLeaves || [];
      initStorageKeys = await this.buildInitStorageKeys(
        channelId,
        rollupBridgeAddress,
        preAllocatedLeaves,
      );
      console.log(`[SynthesizerAdapter] Built initStorageKeys from previousState: ${initStorageKeys.length} keys`);

      // Use contractAddress from previousState
      if (previousState.contractAddress) {
        options.contractAddress = previousState.contractAddress;
        console.log(`[SynthesizerAdapter] Using contractAddress from previousState: ${previousState.contractAddress}`);
      }
    } else if (channelId && rollupBridgeAddress) {
      // Fetch channel data from on-chain
      console.log(`[SynthesizerAdapter] Fetching channel data from on-chain...`);
      console.log(`  Channel ID: ${channelId}`);
      console.log(`  Bridge Address: ${rollupBridgeAddress}`);

      const channelData = await this.fetchChannelData(channelId, rollupBridgeAddress, ROLLUP_BRIDGE_CORE_ABI);
      preAllocatedLeaves = channelData.preAllocatedLeaves;
      initStorageKeys = await this.buildInitStorageKeys(
        channelId,
        rollupBridgeAddress,
        channelData.preAllocatedLeaves,
      );
      console.log(`[SynthesizerAdapter] Built initStorageKeys from on-chain: ${initStorageKeys.length} keys`);

      // Use targetAddress from on-chain data as contractAddress
      if (channelData.contractAddress) {
        options.contractAddress = channelData.contractAddress;
        console.log(`[SynthesizerAdapter] Using targetAddress from on-chain data: ${channelData.contractAddress}`);
      }
    } else {
      throw new Error(
        'Either previousState or (channelId and rollupBridgeAddress) must be provided to build initStorageKeys',
      );
    }

    // Build simulation options using current SynthesizerSimulationOpts type
    const simulationOpts: SynthesizerSimulationOpts = {
      txNonce: options.txNonce !== undefined ? options.txNonce : 0n,
      rpcUrl: effectiveRpcUrl,
      senderL2PrvKey: options.senderL2PrvKey,
      blockNumber,
      contractAddress: options.contractAddress as `0x${string}`,
      initStorageKeys,
      callData: calldataBytes,
    };

    console.log('[SynthesizerAdapter] Creating synthesizer options...');
    const synthesizerOpts = await createSynthesizerOptsForSimulationFromRPC(simulationOpts);

    // Get state manager from synthesizer options (BEFORE creating synthesizer)
    const stateManager = synthesizerOpts.stateManager;
    const contractAddress = new Address(toBytes(addHexPrefix(options.contractAddress)));

    // Restore storage values based on source (BEFORE creating synthesizer)
    let expectedInitialRoot: string;
    if (previousState) {
      // Restore from previousState (snapshot from previous transaction)
      expectedInitialRoot = previousState.stateRoot;
      console.log(`[SynthesizerAdapter] 📋 Initial Root (from previous state): ${expectedInitialRoot}`);
      console.log(`[SynthesizerAdapter] Restoring ${previousState.storageEntries.length} storage entries from previousState...`);
      for (const entry of previousState.storageEntries) {
        const key = hexToBytes(addHexPrefix(entry.key));
        const value = hexToBytes(addHexPrefix(entry.value));
        await stateManager.putStorage(contractAddress, key, value);
      }

      // Rebuild initial merkle tree
      console.log('[SynthesizerAdapter] Rebuilding initial merkle tree from previousState...');
      await stateManager.rebuildInitialMerkleTree();
      const restoredRoot = stateManager.initialMerkleTree.root;
      const restoredRootHex = '0x' + restoredRoot.toString(16).padStart(64, '0');
      console.log(`[SynthesizerAdapter] ✅ Restored Merkle Root: ${restoredRootHex}`);

      if (expectedInitialRoot && restoredRootHex.toLowerCase() !== expectedInitialRoot.toLowerCase()) {
        console.warn(`[SynthesizerAdapter] ⚠️  Merkle root mismatch!`);
        console.warn(`   Expected: ${expectedInitialRoot}`);
        console.warn(`   Restored: ${restoredRootHex}`);
      }
    } else if (channelId && rollupBridgeAddress) {
      // Fetch and restore from on-chain data
      const channelData = await this.fetchChannelData(channelId, rollupBridgeAddress, ROLLUP_BRIDGE_CORE_ABI);
      expectedInitialRoot = channelData.initialRoot;
      console.log(`[SynthesizerAdapter] 📋 Initial Root (from on-chain): ${expectedInitialRoot}`);

      // Restore storage entries from on-chain data
      console.log(`[SynthesizerAdapter] Restoring ${channelData.storageEntries.length} storage entries from on-chain...`);
      for (const entry of channelData.storageEntries) {
        const key = hexToBytes(addHexPrefix(entry.key));
        const value = hexToBytes(addHexPrefix(entry.value));
        await stateManager.putStorage(contractAddress, key, value);
      }

      // Rebuild initial merkle tree
      console.log('[SynthesizerAdapter] Rebuilding initial merkle tree from on-chain data...');
      await stateManager.rebuildInitialMerkleTree();
      const restoredRoot = stateManager.initialMerkleTree.root;
      const restoredRootHex = '0x' + restoredRoot.toString(16).padStart(64, '0');
      console.log(`[SynthesizerAdapter] ✅ Restored Merkle Root: ${restoredRootHex}`);

      if (expectedInitialRoot && restoredRootHex.toLowerCase() !== expectedInitialRoot.toLowerCase()) {
        console.warn(`[SynthesizerAdapter] ⚠️  Merkle root mismatch!`);
        console.warn(`   Expected: ${expectedInitialRoot}`);
        console.warn(`   Restored: ${restoredRootHex}`);
      }
    }

    // NOW create synthesizer (AFTER merkle tree is properly restored)
    console.log('[SynthesizerAdapter] Creating synthesizer with restored state...');
    const synthesizer = (await createSynthesizer(synthesizerOpts)) as Synthesizer;

    console.log('[SynthesizerAdapter] Executing transaction...');
    let runTxResult;
    try {
      runTxResult = await synthesizer.synthesizeTX();
    } catch (error: any) {
      console.error('\n❌ [SynthesizerAdapter] CRITICAL ERROR: Synthesizer execution failed!');
      console.error(`   Error: ${error.message || error}`);
      if (error.stack) {
        const stackLines = error.stack.split('\n').slice(0, 10);
        console.error(`   Stack trace:\n${stackLines.join('\n')}`);
      }
      throw new Error(`Synthesizer execution failed: ${error.message || error}`);
    }

    // Check transaction execution result
    const executionSuccess = !runTxResult.execResult.exceptionError;
    const gasUsed = runTxResult.totalGasSpent;
    const logsCount = runTxResult.execResult.logs?.length || 0;
    const errorMessage = runTxResult.execResult.exceptionError
      ? runTxResult.execResult.exceptionError.error
      : undefined;

    console.log('[SynthesizerAdapter] Transaction execution result:');
    console.log(`  - Success: ${executionSuccess}`);
    console.log(`  - Gas Used: ${gasUsed}`);
    console.log(`  - Logs: ${logsCount}`);
    if (!executionSuccess && errorMessage) {
      console.log(`  - Error: ${errorMessage}`);
    }

    if (!executionSuccess) {
      console.error('\n❌ [SynthesizerAdapter] Transaction REVERTED!');
      console.error('   This may indicate:');
      console.error('   - Insufficient balance for transfer');
      console.error('   - Invalid function call');
      console.error('   - Contract logic error');
      if (errorMessage) {
        console.error(`   - Error message: ${errorMessage}`);
      }
      throw new Error(`Transaction execution failed: ${errorMessage || 'Transaction reverted'}`);
    }

    console.log('[SynthesizerAdapter] Generating circuit outputs...');
    const circuitGenerator = await createCircuitGenerator(synthesizer);

    // Get the data before writing (if we need in-memory access)
    const placementVariables = circuitGenerator.variableGenerator.placementVariables || [];
    const a_pub: PublicInstance = circuitGenerator.variableGenerator.publicInstance || {
      a_pub_user: [],
      a_pub_block: [],
      a_pub_function: [],
    };
    const permutation = circuitGenerator.permutationGenerator?.permutation || [];

    // Export final state
    console.log('[SynthesizerAdapter] Exporting final state...');

    const finalStateRoot = await stateManager.getUpdatedMerkleTreeRoot();
    const finalStateRootHex = '0x' + finalStateRoot.toString(16).padStart(64, '0');
    console.log(`[SynthesizerAdapter] 🆕 New Merkle Root (after transaction): ${finalStateRootHex}`);

    // Build state snapshot (matching snapshot.ts logic)
    // registeredKeys and storageEntries should NOT include preAllocatedLeaves
    // preAllocatedLeaves are stored separately
    const allRegisteredKeys = (stateManager.registeredKeys || []).map(key => bytesToHex(key));

    // Filter out preAllocatedLeaves keys from registeredKeys
    const preAllocatedLeafKeys = new Set(preAllocatedLeaves.map(leaf => leaf.key.toLowerCase()));
    const registeredKeys = allRegisteredKeys.filter(key => !preAllocatedLeafKeys.has(key.toLowerCase()));

    const storageEntries: Array<{ index?: number; key: string; value: string }> = [];

    for (let i = 0; i < registeredKeys.length; i++) {
      const key = registeredKeys[i];
      const keyBytes = hexToBytes(addHexPrefix(key));
      const value = await stateManager.getStorage(contractAddress, keyBytes);
      const valueBigInt = bytesToBigInt(value);
      const valueHex = '0x' + valueBigInt.toString(16).padStart(64, '0');

      storageEntries.push({
        index: i,
        key,
        value: valueHex,
      });
    }

    const finalState: StateSnapshot = {
      stateRoot: '0x' + finalStateRoot.toString(16).padStart(64, '0').toLowerCase(),
      registeredKeys,
      storageEntries,
      contractAddress: options.contractAddress,
      preAllocatedLeaves: preAllocatedLeaves,
    };
    console.log(`[SynthesizerAdapter] ✅ Final state exported: ${finalState.stateRoot}`);

    // Write outputs if path provided
    if (outputPath) {
      circuitGenerator.writeOutputs(outputPath);
      console.log(`[SynthesizerAdapter] ✅ Outputs written to: ${outputPath}`);

      // Also save state_snapshot.json
      const stateSnapshotPath = resolve(outputPath, 'state_snapshot.json');
      writeFileSync(
        stateSnapshotPath,
        JSON.stringify(finalState, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2),
        'utf-8',
      );
      console.log(`[SynthesizerAdapter] ✅ State snapshot saved to: ${stateSnapshotPath}`);
    }

    // Derive sender L2 address from private key for metadata
    const senderPubKey = jubjub.Point.BASE.multiply(bytesToBigInt(options.senderL2PrvKey));
    const senderPubKeyBytes = new Uint8Array(64);
    senderPubKeyBytes.set(setLengthLeft(toBytes(senderPubKey.toAffine().x), 32), 0);
    senderPubKeyBytes.set(setLengthLeft(toBytes(senderPubKey.toAffine().y), 32), 32);
    const senderL2Addr = fromEdwardsToAddress(senderPubKeyBytes);

    const result: SynthesizerResult = {
      instance: a_pub, // PublicInstance type: {a_pub_user, a_pub_block, a_pub_function}
      placementVariables,
      permutation,
      state: finalState,
      metadata: {
        blockNumber,
        from: addHexPrefix(senderL2Addr.toString()),
        to: options.contractAddress,
        contractAddress: options.contractAddress,
        eoaAddresses: previousState?.registeredKeys?.map(() => '') || [], // Placeholder - not used in state channel mode
        calldata: addHexPrefix(Buffer.from(calldataBytes).toString('hex')),
      },
      executionResult: {
        success: executionSuccess,
        gasUsed,
        logsCount,
        error: errorMessage,
      },
    };

    console.log('[SynthesizerAdapter] ✅ Synthesis complete');
    console.log(`  - a_pub_user length: ${a_pub.a_pub_user.length}`);
    console.log(`  - a_pub_block length: ${a_pub.a_pub_block.length}`);
    console.log(`  - a_pub_function length: ${a_pub.a_pub_function.length}`);
    console.log(`  - Placements: ${placementVariables.length}`);
    console.log(`  - State root: ${finalState.stateRoot}`);

    return result;
  }

  /**
   * High-level API: Synthesize L2 State Channel transfer transaction
   * This method handles all complexity internally:
   * - Fetches blockNumber from initializeTxHash
   * - Fetches contractAddress from on-chain channel data
   * - Loads previousState from file path (if provided)
   * - Generates calldata automatically
   *
   * @param params - High-level transfer parameters
   * @returns Synthesis result with state information
   */
  async synthesizeL2Transfer(params: SynthesizeL2TransferParams): Promise<SynthesizeL2TransferResult> {
    const {
      channelId,
      initializeTxHash,
      senderL2PrvKey,
      recipientL2Address,
      amount,
      previousStatePath,
      outputPath,
      rollupBridgeAddress,
    } = params;

    const effectiveRpcUrl = params.rpcUrl || this.rpcUrl;

    try {
      // Load previous state if this is a subsequent transaction
      let previousState: StateSnapshot | undefined;
      let previousStateRoot: string;

      if (previousStatePath) {
        console.log(`[SynthesizerAdapter] Loading previous state from ${previousStatePath}...`);
        const fs = await import('fs');
        if (!fs.existsSync(previousStatePath)) {
          throw new Error(`State snapshot file not found: ${previousStatePath}`);
        }
        const stateSnapshot = JSON.parse(fs.readFileSync(previousStatePath, 'utf-8'));
        previousState = stateSnapshot as StateSnapshot;
        previousStateRoot = previousState.stateRoot;
        console.log(`   ✅ Previous state root: ${previousStateRoot}`);
      } else {
        console.log('[SynthesizerAdapter] First transaction: fetching state from on-chain...');
        // Get state root from initialize transaction for verification
        const receipt = await this.provider.getTransactionReceipt(initializeTxHash);
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

      // Build transfer calldata using static helper
      const { parseEther } = await import('ethers');
      const transferAmount = parseEther(amount);
      const calldata = SynthesizerAdapter.buildTransferCalldata(recipientL2Address, transferAmount);

      // Get block number from initialize transaction
      const tx = await this.provider.getTransaction(initializeTxHash);
      if (tx === null || tx.blockNumber === null) {
        throw new Error('Initialize transaction not found or not yet mined');
      }

      // Synthesize using low-level synthesizeFromCalldata
      // SynthesizerAdapter will automatically:
      // - Fetch channel data and target contract address from on-chain
      // - Build initStorageKeys with L1 addresses and MPT keys
      // - Restore storage values and rebuild merkle tree
      const result = await this.synthesizeFromCalldata(calldata, {
        contractAddress: '', // Will be fetched from on-chain channel data or previousState
        senderL2PrvKey,
        blockNumber: tx.blockNumber,
        previousState,
        outputPath,
        channelId,
        rollupBridgeAddress,
        rpcUrl: effectiveRpcUrl,
      });

      // Return simplified result
      const { resolve } = await import('path');
      const finalStateSnapshotPath = outputPath
        ? resolve(outputPath, 'state_snapshot.json')
        : 'state_snapshot.json';

      return {
        success: result.executionResult?.success ?? false,
        stateRoot: result.state.stateRoot,
        previousStateRoot,
        newStateRoot: result.state.stateRoot,
        stateSnapshotPath: finalStateSnapshotPath,
        outputPath,
      };
    } catch (error: any) {
      return {
        success: false,
        stateRoot: '',
        previousStateRoot: '',
        newStateRoot: '',
        stateSnapshotPath: '',
        outputPath,
        error: error.message || String(error),
      };
    }
  }

  /**
   * Synthesize L2 State Channel transaction
   * Fetches channel data from on-chain, generates L2 keys, and synthesizes the transaction
   *
   * @param channelId - Channel ID on RollupBridge
   * @param params - Transaction parameters (to, tokenAddress, amount, rollupBridgeAddress, senderIdx)
   * @param options - Optional synthesis options (previousState, outputPath)
   * @returns Instance JSON, placement variables, permutation, state, and metadata
   */
  async synthesizeL2StateChannel(
    channelId: number,
    params: {
      to: string; // Recipient L1 address
      tokenAddress: string; // Token contract address
      amount: string; // Transfer amount (as string)
      rollupBridgeAddress: string; // RollupBridge contract address
      senderIdx: number; // Index of sender in channel participants
    },
    options?: SynthesizeOptions,
  ): Promise<SynthesizerResult> {
    const { previousState, outputPath } = options || {};
    const { to, tokenAddress, amount, rollupBridgeAddress, senderIdx } = params;

    console.log(`[SynthesizerAdapter] Processing L2 State Channel transaction`);
    console.log(`  Channel ID: ${channelId}`);
    console.log(`  Token: ${tokenAddress}`);
    console.log(`  Recipient (L1): ${to}`);
    console.log(`  Amount: ${amount}`);
    console.log(`  Sender Index: ${senderIdx}`);

    // Create bridge contract instance
    const bridgeContract = new ethers.Contract(rollupBridgeAddress, ROLLUP_BRIDGE_CORE_ABI, this.provider);

    // Fetch channel participants
    const participants: string[] = await bridgeContract.getChannelParticipants(channelId);
    if (!participants || participants.length <= senderIdx) {
      throw new Error(`Invalid sender index ${senderIdx} for channel with ${participants?.length || 0} participants`);
    }

    // Get recipient index
    const recipientIdx = participants.findIndex((p: string) => p.toLowerCase() === to.toLowerCase());
    if (recipientIdx === -1) {
      throw new Error(`Recipient ${to} is not a participant in channel ${channelId}`);
    }

    // Generate L2 keys for all participants
    const participantsWithKeys = participants.map((l1Address, idx) => {
      // Generate deterministic private key from index
      const privateKey = setLengthLeft(bigIntToBytes(BigInt(idx + 1) * 123456789n), 32);
      const publicKey = jubjub.Point.BASE.multiply(bytesToBigInt(privateKey)).toBytes();
      const l2Address = fromEdwardsToAddress(publicKey).toString();

      return {
        l1Address,
        l2Address,
        privateKey,
        publicKey,
      };
    });

    // Get sender's L2 key
    const sender = participantsWithKeys[senderIdx];
    const recipient = participantsWithKeys[recipientIdx];

    // Construct ERC20 transfer calldata using helper method
    const calldata = SynthesizerAdapter.buildTransferCalldata(recipient.l2Address, BigInt(amount));

    // Get current block number
    const blockNumber = await this.provider.getBlockNumber();

    // Normalize previous state if provided
    let normalizedPreviousState = previousState;
    if (previousState) {
      normalizedPreviousState = this.normalizeStateSnapshot(previousState);
    }

    // Use synthesizeFromCalldata with normalized state
    return this.synthesizeFromCalldata(calldata, {
      contractAddress: tokenAddress,
      senderL2PrvKey: sender.privateKey,
      blockNumber,
      previousState: normalizedPreviousState,
      txNonce: previousState?.userNonces?.[senderIdx] ?? 0n,
      outputPath,
      // Note: channelId and rollupBridgeAddress should be provided if previousState is not available
      // For now, this method requires previousState to be provided
    });
  }

  /**
   * Normalize state snapshot to ensure correct format
   * Converts userL2Addresses from bytes objects to hex strings
   * Converts userStorageSlots and userNonces from strings to bigints
   */
  private normalizeStateSnapshot(snapshot: StateSnapshot): StateSnapshot {
    // Normalize userL2Addresses
    const normalizedUserL2Addresses = (snapshot.userL2Addresses || []).map((addr: any) => {
      if (typeof addr === 'string') {
        return addr;
      }
      // Handle bytes object format: { bytes: { "0": number, "1": number, ... } }
      if (addr && typeof addr === 'object' && 'bytes' in addr) {
        const bytesObj = (addr as any).bytes;
        const keys = Object.keys(bytesObj).sort((a, b) => Number(a) - Number(b));
        const bytesArray = keys.map(k => bytesObj[String(k)]);
        if (bytesArray.length !== 20) {
          throw new Error(`Invalid address length: expected 20 bytes, got ${bytesArray.length}`);
        }
        return '0x' + bytesArray.map((b: number) => b.toString(16).padStart(2, '0')).join('');
      }
      throw new Error(`Invalid address format: ${JSON.stringify(addr)}`);
    });

    // Normalize userStorageSlots
    const normalizedUserStorageSlots = (snapshot.userStorageSlots || []).map((slot: any) => {
      if (typeof slot === 'bigint') {
        return slot;
      }
      if (typeof slot === 'string') {
        return BigInt(slot);
      }
      return BigInt(slot);
    });

    // Normalize userNonces
    const normalizedUserNonces = (snapshot.userNonces || []).map((nonce: any) => {
      if (typeof nonce === 'bigint') {
        return nonce;
      }
      if (typeof nonce === 'string') {
        return BigInt(nonce);
      }
      return BigInt(nonce);
    });

    return {
      ...snapshot,
      userL2Addresses: normalizedUserL2Addresses,
      userStorageSlots: normalizedUserStorageSlots,
      userNonces: normalizedUserNonces,
    };
  }

}
