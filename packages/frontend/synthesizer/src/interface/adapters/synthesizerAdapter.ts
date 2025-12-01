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
import {
  bytesToBigInt,
  setLengthLeft,
  utf8ToBytes,
  hexToBytes,
  concatBytes,
  addHexPrefix,
  Address,
  toBytes,
  bytesToHex,
  bigIntToBytes,
} from '@ethereumjs/util';
import { createSynthesizerOptsForSimulationFromRPC, type SynthesizerSimulationOpts } from '../rpc/rpc.ts';
import { createSynthesizer, Synthesizer } from '../../synthesizer/index.ts';
import { createCircuitGenerator } from '../../circuitGenerator/circuitGenerator.ts';
import type { SynthesizerInterface } from '../../synthesizer/types/index.ts';
import { fromEdwardsToAddress } from '../../TokamakL2JS/index.ts';
import type { StateSnapshot } from '../../TokamakL2JS/stateManager/types.ts';
import type { PublicInstance, PublicInstanceDescription } from '../../circuitGenerator/types/types.ts';

export interface SynthesizerAdapterConfig {
  rpcUrl: string;
}

export interface SynthesizeOptions {
  previousState?: StateSnapshot; // Optional: previous state to restore from
  outputPath?: string; // Optional: path for file outputs
}

export interface CalldataSynthesizeOptions {
  contractAddress: string; // Contract to call
  publicKeyListL2: Uint8Array[]; // L2 public keys for all participants
  addressListL1: string[]; // L1 addresses for all participants
  senderL2PrvKey: Uint8Array; // Sender's L2 private key
  blockNumber?: number; // Block number for state (default: latest)
  userStorageSlots?: number[]; // Storage slots to track (default: [0])
  previousState?: StateSnapshot; // Optional: previous state to restore from
  outputPath?: string; // Optional: path for file outputs
  txNonce?: bigint; // Transaction nonce for sender (default: 0n)
}

export interface SynthesizerResult {
  instance: PublicInstance;
  instanceDescription?: PublicInstanceDescription; // Optional: description for debugging
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
}

export interface L2StateChannelSimulationOptions {
  to: string; // L1 address of the recipient
  tokenAddress: string; // Token address
  amount: string | bigint; // Amount to transfer
  rollupBridgeAddress: string; // Address of the RollupBridgeCore contract
  senderIdx?: number; // Index of the sender in the participant list (default: 0)
  senderPrivateKey?: Uint8Array; // Optional: Explicit private key (if not using deterministic generation)
}

// RollupBridgeCore ABI (minimal subset needed for channel info)
const ROLLUP_BRIDGE_CORE_ABI = [
  'function getChannelInfo(uint256 channelId) view returns (address[] allowedTokens, uint8 state, uint256 participantCount, bytes32 initialRoot)',
  'function getChannelParticipants(uint256 channelId) view returns (address[])',
  'function getChannelTreeSize(uint256 channelId) view returns (uint256)',
  'function getChannelPublicKey(uint256 channelId) view returns (uint256 pkx, uint256 pky)',
  'function getChannelLeader(uint256 channelId) view returns (address)',
  'function getChannelState(uint256 channelId) view returns (uint8)',
  'function getParticipantTokenDeposit(uint256 channelId, address participant, address token) view returns (uint256)',
  'function getParticipantPublicKey(uint256 channelId, address participant) view returns (uint256 pkx, uint256 pky)',
  'function getL2MptKey(uint256 channelId, address participant, address token) view returns (uint256)',
];

// ERC20 Token ABI (minimal subset for validation)
const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
];

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

export class SynthesizerAdapter {
  private rpcUrl: string;
  private provider: ethers.JsonRpcProvider;

  constructor(config: SynthesizerAdapterConfig) {
    this.rpcUrl = config.rpcUrl;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
  }

  /**
   * Normalize state snapshot format
   * Converts userL2Addresses from bytes objects to hex strings,
   * and converts userStorageSlots/userNonces from strings to bigints
   * This allows state_snapshot.json files to be used directly without manual conversion
   */
  private normalizeStateSnapshot(rawSnapshot: any): StateSnapshot {
    // Convert userL2Addresses from bytes objects to hex strings
    const userL2Addresses: string[] = [];
    if (rawSnapshot.userL2Addresses && Array.isArray(rawSnapshot.userL2Addresses)) {
      for (const addr of rawSnapshot.userL2Addresses) {
        if (typeof addr === 'string') {
          // Already a string
          userL2Addresses.push(addr);
        } else if (addr && addr.bytes) {
          // Convert bytes object to Address, then to hex string
          // Object.values() doesn't guarantee order, so we need to sort by key
          // Keys in addr.bytes are strings ("0", "1", "2", ...), so we need to convert them
          const keys = Object.keys(addr.bytes)
            .map(k => parseInt(k, 10))
            .sort((a, b) => a - b);

          // Debug: Log the keys and values
          console.log(`[normalizeStateSnapshot] Processing address with ${keys.length} keys`);
          console.log(`[normalizeStateSnapshot] Keys: ${keys.join(', ')}`);
          console.log(`[normalizeStateSnapshot] addr.bytes keys (original): ${Object.keys(addr.bytes).join(', ')}`);

          // Use String(k) to access the string keys in addr.bytes
          const bytesArray = keys
            .map(k => {
              const keyStr = String(k);
              const value = addr.bytes[keyStr];
              if (value === undefined) {
                console.error(
                  `[normalizeStateSnapshot] Key "${keyStr}" not found in addr.bytes. Available keys: ${Object.keys(addr.bytes).join(', ')}`,
                );
              }
              return value;
            })
            .filter(v => v !== undefined) as number[];

          console.log(
            `[normalizeStateSnapshot] Bytes array length: ${bytesArray.length}, values: ${bytesArray.join(', ')}`,
          );

          const bytes = new Uint8Array(bytesArray);

          // Validate that we have exactly 20 bytes (Address length)
          if (bytes.length !== 20) {
            console.error(`[normalizeStateSnapshot] Invalid address length: expected 20 bytes, got ${bytes.length}`);
            console.error(`[normalizeStateSnapshot] Keys: ${keys.join(', ')}`);
            console.error(`[normalizeStateSnapshot] Bytes array length: ${bytesArray.length}`);
            console.error(`[normalizeStateSnapshot] Address object:`, JSON.stringify(addr, null, 2));
            throw new Error(
              `Invalid address length: expected 20 bytes, got ${bytes.length}. Keys: ${keys.join(', ')}, Bytes: ${bytesArray.join(', ')}`,
            );
          }

          // bytes is 20 bytes (Address), convert to hex string
          try {
            const address = new Address(bytes);
            userL2Addresses.push(address.toString());
          } catch (error: any) {
            console.error(`[normalizeStateSnapshot] Failed to create Address from bytes:`, error.message);
            console.error(
              `[normalizeStateSnapshot] Bytes:`,
              Array.from(bytes)
                .map(b => `0x${b.toString(16).padStart(2, '0')}`)
                .join(' '),
            );
            throw new Error(`Failed to create Address: ${error.message}`);
          }
        } else {
          throw new Error(`Invalid userL2Address format: ${JSON.stringify(addr)}`);
        }
      }
    }

    // Convert userStorageSlots from string[] to bigint[]
    const userStorageSlots = rawSnapshot.userStorageSlots
      ? rawSnapshot.userStorageSlots.map((s: string | bigint) => BigInt(s))
      : [];

    // Convert userNonces from string[] to bigint[]
    const userNonces = rawSnapshot.userNonces ? rawSnapshot.userNonces.map((n: string | bigint) => BigInt(n)) : [];

    return {
      ...rawSnapshot,
      userL2Addresses,
      userStorageSlots,
      userNonces,
    } as StateSnapshot;
  }

  /**
   * Generate deterministic L2 key pairs for state channel participants
   * Matches the pattern from L2TONTransfer/main.ts
   */
  private generateL2KeyPair(index: number): { privateKey: Uint8Array; publicKey: Uint8Array } {
    const seedString = `L2_SEED_${index}`;
    const seed = setLengthLeft(utf8ToBytes(seedString), 32);

    if (index === 0) {
      // First key (sender) uses randomPrivateKey
      const privateKey = jubjub.utils.randomPrivateKey(seed);
      const publicKey = jubjub.Point.BASE.multiply(bytesToBigInt(privateKey)).toBytes();
      return { privateKey, publicKey };
    } else {
      // Rest use keygen - note: keygen returns { secretKey, publicKey }
      const { secretKey, publicKey } = jubjub.keygen(seed);
      return { privateKey: secretKey, publicKey };
    }
  }

  /**
   * Extract EOA addresses from transaction
   * Collects sender and receiver addresses from transaction and logs
   */
  private async extractEOAAddresses(txHash: string): Promise<string[]> {
    const tx = await this.provider.getTransaction(txHash);
    if (!tx) {
      throw new Error(`Transaction not found: ${txHash}`);
    }

    const eoaAddresses = new Set<string>();

    // Add sender address
    if (tx.from) {
      eoaAddresses.add(tx.from.toLowerCase());
    }

    // Get receiver address from transaction logs
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);
      if (receipt && receipt.logs.length > 0) {
        // For ERC20 transfers, parse Transfer event to get receiver
        for (const log of receipt.logs) {
          // Transfer event signature: Transfer(address,address,uint256)
          if (log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
            if (log.topics[2]) {
              const receiver = '0x' + log.topics[2].slice(26); // Remove padding
              eoaAddresses.add(receiver.toLowerCase());
            }
          }
        }
      }
    } catch (error) {
      console.warn('[SynthesizerAdapter] Could not fetch transaction receipt, using minimal address list');
    }

    // Ensure we have at least 2 addresses
    const addressList = Array.from(eoaAddresses);
    if (addressList.length < 2) {
      // Add a dummy address if we don't have enough
      addressList.push('0x0000000000000000000000000000000000000001');
    }

    return addressList;
  }

  /**
   * Synthesize a transaction into circuit instance
   *
   * @param txHash - Ethereum transaction hash (with or without 0x prefix)
   * @param options - Optional synthesis options (previousState, outputPath)
   * @returns Instance JSON, placement variables, permutation, state, and metadata
   */
  async synthesize(txHash: string, options?: SynthesizeOptions): Promise<SynthesizerResult> {
    const { previousState, outputPath } = options || {};
    // Normalize tx hash
    const normalizedHash = txHash.startsWith('0x') ? txHash : `0x${txHash}`;

    console.log(`[SynthesizerAdapter] Processing transaction: ${normalizedHash}`);

    // Get transaction details
    const tx = await this.provider.getTransaction(normalizedHash);
    if (!tx) {
      throw new Error(`Transaction not found: ${normalizedHash}`);
    }
    if (tx.blockNumber === null) {
      throw new Error('Transaction not yet mined');
    }
    if (!tx.to) {
      throw new Error('Transaction must have a recipient (contract call)');
    }
    if (!tx.from) {
      throw new Error('Transaction must have a sender');
    }

    console.log(`[SynthesizerAdapter] Block: ${tx.blockNumber}, From: ${tx.from}, To: ${tx.to}`);

    // Extract EOA addresses
    const eoaAddresses = await this.extractEOAAddresses(normalizedHash);
    console.log(`[SynthesizerAdapter] Found ${eoaAddresses.length} EOA addresses`);

    // Generate L2 key pairs for state channel
    const l2KeyPairs = eoaAddresses.map((_, idx) => this.generateL2KeyPair(idx));
    const publicKeyListL2 = l2KeyPairs.map(kp => kp.publicKey);
    const senderL2PrvKey = l2KeyPairs[0].privateKey;

    // Modify calldata to use L2 address instead of L1 address
    // The original transaction uses L1 recipient, but we need L2 recipient for state channel
    const originalData = hexToBytes(addHexPrefix(tx.data));
    const functionSelector = originalData.slice(0, 4);
    const amount = originalData.slice(36); // Amount starts at byte 36
    const l2Address = setLengthLeft(fromEdwardsToAddress(publicKeyListL2[1]).toBytes(), 32);
    const callDataL2 = concatBytes(functionSelector, l2Address, amount);

    console.log('[SynthesizerAdapter] Modified calldata to use L2 recipient address');

    // Build simulation options
    const simulationOpts: SynthesizerSimulationOpts = {
      txNonce: 0n, // L2 state channel uses fresh nonce starting from 0
      rpcUrl: this.rpcUrl,
      senderL2PrvKey,
      blockNumber: tx.blockNumber - 1, // Use block before tx to get proper sender balance
      contractAddress: tx.to as `0x${string}`,
      userStorageSlots: [0], // Track balance storage slot
      addressListL1: eoaAddresses as `0x${string}`[],
      publicKeyListL2,
      callData: callDataL2, // Use modified calldata with L2 address
    };

    console.log('[SynthesizerAdapter] Creating synthesizer...');

    // Create synthesizer using the new architecture
    const synthesizerOpts = await createSynthesizerOptsForSimulationFromRPC(simulationOpts);
    const synthesizer = (await createSynthesizer(synthesizerOpts)) as Synthesizer;

    // Restore previous state if provided
    if (previousState) {
      console.log('[SynthesizerAdapter] Restoring previous state...');
      // Normalize the state snapshot to handle bytes objects and string conversions
      const normalizedState = this.normalizeStateSnapshot(previousState);
      const stateManager = synthesizer.getTokamakStateManager();
      await stateManager.createStateFromSnapshot(normalizedState);
      console.log(`[SynthesizerAdapter] ✅ Previous state restored: ${normalizedState.stateRoot}`);
    }

    console.log('[SynthesizerAdapter] Executing transaction...');

    // Execute transaction
    const runTxResult = await synthesizer.synthesizeTX();

    console.log('[SynthesizerAdapter] Generating circuit outputs...');

    // Generate circuit outputs
    const circuitGenerator = await createCircuitGenerator(synthesizer);

    // Get the data before writing (if we need in-memory access)
    const placementVariables = circuitGenerator.variableGenerator.placementVariables || [];
    const a_pub: PublicInstance = circuitGenerator.variableGenerator.publicInstance || {
      a_pub_user: [],
      a_pub_block: [],
      a_pub_function: [],
    };
    const a_pub_desc: PublicInstanceDescription | undefined =
      circuitGenerator.variableGenerator.publicInstanceDescription;
    const permutation = circuitGenerator.permutationGenerator?.permutation || [];

    // Export final state
    console.log('[SynthesizerAdapter] Exporting final state...');
    const stateManager = synthesizer.getTokamakStateManager();
    const finalState = await stateManager.exportState();
    console.log(`[SynthesizerAdapter] ✅ Final state exported: ${finalState.stateRoot}`);

    // Write outputs to file if path provided
    if (outputPath) {
      circuitGenerator.writeOutputs(outputPath);

      // Also write state_snapshot.json (matching onchain-channel-simulation.ts)
      const { writeFileSync, mkdirSync } = await import('fs');
      mkdirSync(outputPath, { recursive: true });
      const statePath = `${outputPath}/state_snapshot.json`;
      writeFileSync(
        statePath,
        JSON.stringify(finalState, (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2),
      );

      console.log(`[SynthesizerAdapter] Outputs written to: ${outputPath}`);
    }

    const result: SynthesizerResult = {
      instance: a_pub, // PublicInstance type: {a_pub_user, a_pub_block, a_pub_function}
      instanceDescription: a_pub_desc, // PublicInstanceDescription for debugging
      placementVariables,
      permutation,
      state: finalState, // Include final state
      metadata: {
        txHash: normalizedHash,
        blockNumber: tx.blockNumber,
        from: tx.from,
        to: tx.to,
        contractAddress: tx.to,
        eoaAddresses,
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
    const { previousState: rawPreviousState, outputPath } = options;

    // Normalize previousState if provided (handles bytes objects and string conversions)
    const previousState = rawPreviousState ? this.normalizeStateSnapshot(rawPreviousState) : undefined;

    // Normalize calldata to Uint8Array
    const calldataBytes = typeof calldata === 'string' ? hexToBytes(addHexPrefix(calldata)) : calldata;

    console.log('[SynthesizerAdapter] Processing calldata directly (State Channel mode)');
    console.log(`  Contract: ${options.contractAddress}`);
    console.log(`  Participants: ${options.publicKeyListL2.length}`);
    console.log(`  Calldata: ${addHexPrefix(Buffer.from(calldataBytes).toString('hex'))}`);

    // Get block number (default: latest)
    const blockNumber = options.blockNumber || (await this.provider.getBlockNumber());
    console.log(`  Block: ${blockNumber}`);

    // Build simulation options
    const simulationOpts: SynthesizerSimulationOpts = {
      txNonce: options.txNonce !== undefined ? options.txNonce : 0n, // Use provided nonce or default to 0n
      rpcUrl: this.rpcUrl,
      senderL2PrvKey: options.senderL2PrvKey,
      blockNumber,
      contractAddress: options.contractAddress as `0x${string}`,
      userStorageSlots: options.userStorageSlots || [0],
      addressListL1: options.addressListL1 as `0x${string}`[],
      publicKeyListL2: options.publicKeyListL2,
      callData: calldataBytes,
    };

    console.log('[SynthesizerAdapter] Creating synthesizer...');
    const synthesizerOpts = await createSynthesizerOptsForSimulationFromRPC(simulationOpts);

    // Restore previous state BEFORE creating synthesizer (so INI_MERKLE_ROOT is set correctly)
    if (previousState) {
      console.log('[SynthesizerAdapter] Restoring previous state (before synthesizer creation)...');
      // Normalize the state snapshot to handle bytes objects and string conversions
      const normalizedState = this.normalizeStateSnapshot(previousState);
      const stateManager = synthesizerOpts.stateManager as any; // TokamakL2StateManager
      await stateManager.createStateFromSnapshot(normalizedState);
      console.log(`[SynthesizerAdapter] ✅ Previous state restored: ${normalizedState.stateRoot}`);
      console.log(
        `[SynthesizerAdapter] ✅ initialMerkleTree.root: 0x${stateManager.initialMerkleTree.root.toString(16)}`,
      );
    }

    // Now create synthesizer with the correct initialMerkleTree
    const synthesizer = (await createSynthesizer(synthesizerOpts)) as Synthesizer;

    // Verify restoration if previousState was provided
    if (previousState) {
      console.log('[SynthesizerAdapter] Verifying state restoration...');
      const stateManager = synthesizer.getTokamakStateManager();

      // Debug: Verify storage was restored correctly
      const contractAddr = new Address(toBytes(addHexPrefix(previousState.contractAddress)));
      console.log('[Debug] Verifying restored storage:');
      console.log(`[Debug] Contract: ${previousState.contractAddress}`);
      console.log(`[Debug] Storage keys registered: ${previousState.registeredKeys.length}`);
      for (let i = 0; i < Math.min(3, previousState.storageEntries.length); i++) {
        const entry = previousState.storageEntries[i];
        if (entry && entry.value !== '0x') {
          const key = hexToBytes(addHexPrefix(entry.key));
          const storedValue = await stateManager.getStorage(contractAddr, key);
          const expectedBigInt = BigInt(entry.value);
          const actualBigInt = bytesToBigInt(storedValue);
          const match = expectedBigInt === actualBigInt ? '✅' : '❌';
          console.log(
            `  [${i}] ${match} Key: ${entry.key.slice(0, 10)}... Expected: ${expectedBigInt}, Actual: ${actualBigInt}`,
          );
        }
      }

      // Debug: Check if sender's storage key is in registered keys
      console.log('[Debug] Checking sender storage key:');
      // Get sender address from private key
      const senderPubKey = jubjub.Point.BASE.multiply(bytesToBigInt(options.senderL2PrvKey));
      const senderPubKeyBytes = new Uint8Array(64);
      senderPubKeyBytes.set(setLengthLeft(toBytes(senderPubKey.toAffine().x), 32), 0);
      senderPubKeyBytes.set(setLengthLeft(toBytes(senderPubKey.toAffine().y), 32), 32);
      const senderL2Addr = fromEdwardsToAddress(senderPubKeyBytes);
      console.log(`  Sender L2: ${addHexPrefix(senderL2Addr.toString())}`);
      const senderStorageKey = stateManager.getUserStorageKey([senderL2Addr, 0], 'L2');
      const senderStorageKeyHex = bytesToHex(senderStorageKey);
      console.log(`  Sender key: ${senderStorageKeyHex.slice(0, 20)}...`);
      const keyIndex = previousState.registeredKeys.findIndex(
        k => k.toLowerCase() === senderStorageKeyHex.toLowerCase(),
      );
      console.log(`  Key registered: ${keyIndex >= 0 ? `✅ at index ${keyIndex}` : '❌ NOT FOUND'}`);
      if (keyIndex >= 0) {
        const senderBalance = await stateManager.getStorage(contractAddr, senderStorageKey);
        console.log(`  Sender balance: ${bytesToBigInt(senderBalance)}`);
      }

      // Debug: Check user account nonces
      console.log('[Debug] User account nonces:');
      for (let i = 0; i < previousState.userL2Addresses.length; i++) {
        const addr = new Address(toBytes(addHexPrefix(previousState.userL2Addresses[i])));
        const account = await stateManager.getAccount(addr);
        const expectedNonce = previousState.userNonces[i];
        const actualNonce = account?.nonce || 0n;
        const match = expectedNonce === actualNonce ? '✅' : '❌';
        console.log(`  [${i}] ${match} Expected: ${expectedNonce}, Actual: ${actualNonce}`);
      }
    }

    console.log('[SynthesizerAdapter] Executing transaction...');
    const runTxResult = await synthesizer.synthesizeTX();

    console.log('[SynthesizerAdapter] Generating circuit outputs...');
    const circuitGenerator = await createCircuitGenerator(synthesizer);

    // Get the data before writing (if we need in-memory access)
    const placementVariables = circuitGenerator.variableGenerator.placementVariables || [];
    const a_pub: PublicInstance = circuitGenerator.variableGenerator.publicInstance || {
      a_pub_user: [],
      a_pub_block: [],
      a_pub_function: [],
    };
    const a_pub_desc: PublicInstanceDescription | undefined =
      circuitGenerator.variableGenerator.publicInstanceDescription;
    const permutation = circuitGenerator.permutationGenerator?.permutation || [];

    // Export final state
    console.log('[SynthesizerAdapter] Exporting final state...');
    const stateManager = synthesizer.getTokamakStateManager();
    const finalState = await stateManager.exportState();
    console.log(`[SynthesizerAdapter] ✅ Final state exported: ${finalState.stateRoot}`);

    // Write outputs if path provided
    if (outputPath) {
      circuitGenerator.writeOutputs(outputPath);

      // Also write state_snapshot.json (matching onchain-channel-simulation.ts)
      const { writeFileSync, mkdirSync } = await import('fs');
      mkdirSync(outputPath, { recursive: true });
      const statePath = `${outputPath}/state_snapshot.json`;
      writeFileSync(
        statePath,
        JSON.stringify(finalState, (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2),
      );

      console.log(`[SynthesizerAdapter] ✅ Outputs written to: ${outputPath}`);
    }

    const result: SynthesizerResult = {
      instance: a_pub, // PublicInstance type: {a_pub_user, a_pub_block, a_pub_function}
      instanceDescription: a_pub_desc, // PublicInstanceDescription for debugging
      placementVariables,
      permutation,
      state: finalState,
      metadata: {
        blockNumber,
        from: addHexPrefix(fromEdwardsToAddress(options.publicKeyListL2[0]).toString()),
        to: options.contractAddress,
        contractAddress: options.contractAddress,
        eoaAddresses: options.addressListL1,
        calldata: addHexPrefix(Buffer.from(calldataBytes).toString('hex')),
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
   * Alternative method for backward compatibility
   */
  async parseTransactionByHash(txHash: string, outputPath?: string): Promise<SynthesizerResult> {
    return this.synthesize(txHash, { outputPath });
  }

  /**
   * Synthesize an L2 State Channel transaction simulation
   * Automatically fetches channel parameters and sets up the environment
   *
   * @param channelId - The ID of the channel to simulate
   * @param params - Transaction parameters (recipient, token, amount, etc.)
   * @param options - Optional synthesis options (previousState, outputPath)
   */
  async synthesizeL2StateChannel(
    channelId: number,
    params: L2StateChannelSimulationOptions,
    options?: SynthesizeOptions,
  ): Promise<SynthesizerResult> {
    console.log(`[SynthesizerAdapter] Starting L2 State Channel Simulation for Channel ID: ${channelId}`);

    // 1. Fetch Channel Data
    const bridgeContract = new ethers.Contract(params.rollupBridgeAddress, ROLLUP_BRIDGE_CORE_ABI, this.provider);
    const channelData = await this.fetchChannelData(bridgeContract, channelId);

    // 2. Identify Sender and Recipient
    const senderIdx = params.senderIdx || 0;
    if (senderIdx >= channelData.participants.length) {
      throw new Error(`Sender index ${senderIdx} out of bounds (participants: ${channelData.participants.length})`);
    }
    const senderL1 = channelData.participants[senderIdx];

    // Find recipient index
    const recipientL1 = params.to.toLowerCase();
    const recipientIdx = channelData.participants.findIndex(p => p.toLowerCase() === recipientL1);
    if (recipientIdx === -1) {
      throw new Error(`Recipient ${params.to} is not a participant in this channel`);
    }

    console.log(`[SynthesizerAdapter] Sender: ${senderL1} (Index: ${senderIdx})`);
    console.log(`[SynthesizerAdapter] Recipient: ${recipientL1} (Index: ${recipientIdx})`);

    // 2.5. Validate token address is a valid ERC20 contract (not checking against allowed tokens list)
    try {
      const tokenContract = new ethers.Contract(params.tokenAddress, ERC20_ABI, this.provider);
      // Try to call balanceOf with zero address to verify it's an ERC20 contract
      await tokenContract.balanceOf('0x0000000000000000000000000000000000000000');
      console.log(`[SynthesizerAdapter] Token validated: ${params.tokenAddress} is a valid ERC20 contract`);
    } catch (error: any) {
      throw new Error(`Token ${params.tokenAddress} is not a valid ERC20 contract: ${error.message}`);
    }

    // 3. Generate Keys (Deterministic or Explicit)
    // We need keys for ALL participants to map L1 -> L2 addresses

    // Helper for simulation key generation (matches onchain-channel-simulation.ts)
    const generateSimulationKey = (index: number) => {
      const privateKey = setLengthLeft(bigIntToBytes(BigInt(index + 1) * 123456789n), 32);
      const publicKey = jubjub.Point.BASE.multiply(bytesToBigInt(privateKey)).toBytes();
      return { privateKey, publicKey };
    };

    // Fetch public keys from contract to ensure we have the correct L2 addresses
    const publicKeyListL2: Uint8Array[] = [];
    for (let i = 0; i < channelData.participants.length; i++) {
      try {
        const [pkx, pky] = await bridgeContract.getParticipantPublicKey(channelId, channelData.participants[i]);
        if (pkx === 0n && pky === 0n) {
          // If not registered on chain, fall back to simulation generation
          const kp = generateSimulationKey(i);
          publicKeyListL2.push(kp.publicKey);
        } else {
          // Reconstruct public key bytes
          const pkBytes = new Uint8Array(64);
          pkBytes.set(setLengthLeft(bigIntToBytes(pkx), 32), 0);
          pkBytes.set(setLengthLeft(bigIntToBytes(pky), 32), 32);
          publicKeyListL2.push(pkBytes);
        }
      } catch (e) {
        // Fallback
        const kp = generateSimulationKey(i);
        publicKeyListL2.push(kp.publicKey);
      }
    }

    // Sender private key
    let senderL2PrvKey: Uint8Array;
    if (params.senderPrivateKey) {
      senderL2PrvKey = params.senderPrivateKey;
    } else {
      // If not provided, we must generate it using the simulation strategy
      senderL2PrvKey = generateSimulationKey(senderIdx).privateKey;
    }

    // 4. Construct Calldata
    // transfer(address recipient, uint256 amount)
    // We need the L2 address of the recipient
    const recipientPublicKey = publicKeyListL2[recipientIdx];
    const recipientL2Address = fromEdwardsToAddress(recipientPublicKey);

    // Function selector for transfer: 0xa9059cbb
    const functionSelector = hexToBytes('0xa9059cbb');

    // Recipient L2 address (padded to 32 bytes)
    const recipientEncoded = setLengthLeft(recipientL2Address.toBytes(), 32);

    // Amount (padded to 32 bytes)
    const amountBigInt = BigInt(params.amount);
    const amountEncoded = setLengthLeft(bigIntToBytes(amountBigInt), 32);

    const calldata = concatBytes(functionSelector, recipientEncoded, amountEncoded);

    // 5. Determine transaction nonce
    // If previousState is provided, use the sender's nonce from the previous state
    let txNonce: bigint;
    if (options?.previousState) {
      const normalizedState = this.normalizeStateSnapshot(options.previousState);
      // Find sender's index in userL2Addresses
      const senderPublicKey = publicKeyListL2[senderIdx];
      const senderL2Address = fromEdwardsToAddress(senderPublicKey);
      const senderL2AddressStr = senderL2Address.toString().toLowerCase();
      const senderStateIdx = normalizedState.userL2Addresses.findIndex(
        (addr: string) => addr.toLowerCase() === senderL2AddressStr,
      );
      if (
        senderStateIdx >= 0 &&
        normalizedState.userNonces &&
        normalizedState.userNonces[senderStateIdx] !== undefined
      ) {
        txNonce = BigInt(normalizedState.userNonces[senderStateIdx]);
        console.log(
          `[SynthesizerAdapter] Using nonce from previous state: ${txNonce} (sender index: ${senderStateIdx})`,
        );
      } else {
        // Fallback: if sender not found in previous state, use 0
        txNonce = 0n;
        console.log(`[SynthesizerAdapter] Sender not found in previous state, using default nonce: 0`);
      }
    } else {
      // No previous state, start with nonce 0
      txNonce = 0n;
    }

    // 6. Synthesize
    return this.synthesizeFromCalldata(bytesToHex(calldata), {
      contractAddress: params.tokenAddress,
      publicKeyListL2,
      addressListL1: channelData.participants,
      senderL2PrvKey,
      previousState: options?.previousState,
      outputPath: options?.outputPath,
      txNonce,
    });
  }

  private async fetchChannelData(bridgeContract: ethers.Contract, channelId: number): Promise<ChannelData> {
    // 1. Get basic channel info
    const [allowedTokens, stateRaw, participantCount, initialRoot] = await bridgeContract.getChannelInfo(channelId);
    const state = Number(stateRaw);

    // 2. Get participants
    const participants: string[] = await bridgeContract.getChannelParticipants(channelId);

    // 3. Get tree size
    const treeSize = Number(await bridgeContract.getChannelTreeSize(channelId));

    // 4. Get leader
    const leader: string = await bridgeContract.getChannelLeader(channelId);

    // 5. Get public key
    const [pkx, pky] = await bridgeContract.getChannelPublicKey(channelId);

    // 6. Get deposits and L2 MPT keys
    const deposits = new Map<string, Map<string, bigint>>();
    const l2MptKeys = new Map<string, Map<string, bigint>>();

    for (const participant of participants) {
      deposits.set(participant, new Map());
      l2MptKeys.set(participant, new Map());

      for (const token of allowedTokens) {
        try {
          const amount = await bridgeContract.getParticipantTokenDeposit(channelId, participant, token);
          const l2Key = await bridgeContract.getL2MptKey(channelId, participant, token);

          deposits.get(participant)!.set(token, amount);
          l2MptKeys.get(participant)!.set(token, l2Key);
        } catch (error) {
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
}
