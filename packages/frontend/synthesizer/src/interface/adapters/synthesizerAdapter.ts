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
import type { StateSnapshot } from '../../TokamakL2JS/stateManager/types.ts';
import type { PublicInstance } from '../../circuitGenerator/types/types.ts';

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

export class SynthesizerAdapter {
  private rpcUrl: string;
  private provider: ethers.JsonRpcProvider;

  constructor(config: SynthesizerAdapterConfig) {
    this.rpcUrl = config.rpcUrl;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
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
      const stateManager = synthesizer.getTokamakStateManager();
      await stateManager.createStateFromSnapshot(previousState);
      console.log(`[SynthesizerAdapter] ✅ Previous state restored: ${previousState.stateRoot}`);
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
    const permutation = circuitGenerator.permutationGenerator?.permutation || [];

    // Export final state
    console.log('[SynthesizerAdapter] Exporting final state...');
    const stateManager = synthesizer.getTokamakStateManager();
    const finalState = await stateManager.exportState();
    console.log(`[SynthesizerAdapter] ✅ Final state exported: ${finalState.stateRoot}`);

    // Write outputs to file if path provided
    if (outputPath) {
      circuitGenerator.writeOutputs(outputPath);
      console.log(`[SynthesizerAdapter] Outputs written to: ${outputPath}`);

      // Also save state_snapshot.json
      const stateSnapshotPath = resolve(outputPath, 'state_snapshot.json');
      writeFileSync(
        stateSnapshotPath,
        JSON.stringify(finalState, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2),
        'utf-8',
      );
      console.log(`[SynthesizerAdapter] ✅ State snapshot saved to: ${stateSnapshotPath}`);
    }

    const result: SynthesizerResult = {
      instance: a_pub, // PublicInstance type: {a_pub_user, a_pub_block, a_pub_function}
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
    const { previousState, outputPath } = options;

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
      const stateManager = synthesizerOpts.stateManager as any; // TokamakL2StateManager
      await stateManager.createStateFromSnapshot(previousState);
      console.log(`[SynthesizerAdapter] ✅ Previous state restored: ${previousState.stateRoot}`);
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
      const senderStorageKey = getUserStorageKey([senderL2Addr, 0], 'TokamakL2');
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
    const permutation = circuitGenerator.permutationGenerator?.permutation || [];

    // Export final state
    console.log('[SynthesizerAdapter] Exporting final state...');
    const stateManager = synthesizer.getTokamakStateManager();
    const finalState = await stateManager.exportState();
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

    const result: SynthesizerResult = {
      instance: a_pub, // PublicInstance type: {a_pub_user, a_pub_block, a_pub_function}
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

    // RollupBridgeCore ABI
    const ROLLUP_BRIDGE_CORE_ABI = [
      'function getChannelInfo(uint256 channelId) view returns (address[] allowedTokens, uint8 state, uint256 participantCount, bytes32 initialRoot)',
      'function getChannelParticipants(uint256 channelId) view returns (address[])',
      'function getParticipantPublicKey(uint256 channelId, address participant) view returns (uint256 pkx, uint256 pky)',
      'function getL2MptKey(uint256 channelId, address participant, address token) view returns (uint256)',
    ];

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

    // Construct ERC20 transfer calldata
    // transfer(address,uint256) = 0xa9059cbb
    const calldata =
      '0xa9059cbb' + // transfer(address,uint256)
      recipient.l2Address.slice(2).padStart(64, '0') + // recipient (L2 address)
      BigInt(amount).toString(16).padStart(64, '0'); // amount

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
      publicKeyListL2: participantsWithKeys.map(p => p.publicKey),
      addressListL1: participantsWithKeys.map(p => p.l1Address),
      senderL2PrvKey: sender.privateKey,
      blockNumber,
      userStorageSlots: [0], // ERC20 balance only (slot 0)
      previousState: normalizedPreviousState,
      txNonce: previousState?.userNonces?.[senderIdx] ?? 0n,
      outputPath,
    });
  }

  /**
   * Normalize state snapshot to ensure correct format
   * Converts userL2Addresses from bytes objects to hex strings
   * Converts userStorageSlots and userNonces from strings to bigints
   */
  private normalizeStateSnapshot(snapshot: StateSnapshot): StateSnapshot {
    // Normalize userL2Addresses
    const normalizedUserL2Addresses = snapshot.userL2Addresses.map(addr => {
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
    const normalizedUserStorageSlots = snapshot.userStorageSlots.map(slot => {
      if (typeof slot === 'bigint') {
        return slot;
      }
      if (typeof slot === 'string') {
        return BigInt(slot);
      }
      return BigInt(slot);
    });

    // Normalize userNonces
    const normalizedUserNonces = snapshot.userNonces.map(nonce => {
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

  /**
   * Alternative method for backward compatibility
   */
  async parseTransactionByHash(txHash: string, outputPath?: string): Promise<SynthesizerResult> {
    return this.synthesize(txHash, { outputPath });
  }
}
