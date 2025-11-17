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
import { bytesToBigInt, setLengthLeft, utf8ToBytes, hexToBytes, concatBytes, addHexPrefix } from '@ethereumjs/util';
import { createSynthesizerOptsForSimulationFromRPC, type SynthesizerSimulationOpts } from '../rpc/rpc.ts';
import { createSynthesizer } from '../../synthesizer/index.ts';
import { createCircuitGenerator } from '../../circuitGenerator/circuitGenerator.ts';
import type { SynthesizerInterface } from '../../synthesizer/types/index.ts';
import { fromEdwardsToAddress } from '../../TokamakL2JS/index.ts';

export interface SynthesizerAdapterConfig {
  rpcUrl: string;
}

export interface SynthesizerResult {
  instance: {
    a_pub: string[];
  };
  placementVariables: any[];
  permutation: {
    row: number;
    col: number;
    X: number;
    Y: number;
  }[];
  metadata: {
    txHash: string;
    blockNumber: number;
    from: string;
    to: string | null;
    contractAddress: string;
    eoaAddresses: string[];
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
   * @param outputPath - Optional path for file outputs (if not provided, returns data in memory)
   * @returns Instance JSON, placement variables, permutation, and metadata
   */
  async synthesize(txHash: string, outputPath?: string): Promise<SynthesizerResult> {
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
    const synthesizer = await createSynthesizer(synthesizerOpts);

    console.log('[SynthesizerAdapter] Executing transaction...');

    // Execute transaction
    const runTxResult = await synthesizer.synthesizeTX();

    console.log('[SynthesizerAdapter] Generating circuit outputs...');

    // Generate circuit outputs
    const circuitGenerator = await createCircuitGenerator(synthesizer);

    // Get the data before writing (if we need in-memory access)
    const placementVariables = circuitGenerator.variableGenerator.placementVariables || [];
    const a_pub = circuitGenerator.variableGenerator.a_pub || [];
    const permutation = circuitGenerator.permutationGenerator?.permutation || [];

    // Write outputs to file if path provided
    if (outputPath) {
      circuitGenerator.writeOutputs(outputPath);
      console.log(`[SynthesizerAdapter] Outputs written to: ${outputPath}`);
    }

    const result: SynthesizerResult = {
      instance: {
        a_pub: a_pub as string[],
      },
      placementVariables,
      permutation,
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
    console.log(`  - a_pub length: ${a_pub.length}`);
    console.log(`  - Placements: ${placementVariables.length}`);

    return result;
  }

  /**
   * Alternative method for backward compatibility
   */
  async parseTransactionByHash(txHash: string, outputPath?: string): Promise<SynthesizerResult> {
    return this.synthesize(txHash, outputPath);
  }
}
