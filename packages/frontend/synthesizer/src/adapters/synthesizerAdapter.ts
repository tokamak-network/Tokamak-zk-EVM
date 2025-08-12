/**
 * The adapter provides an external interface that returns data structures directly in memory,
 * eliminating the need for file system operations.
 * Now uses RPC state instead of hardcoded token configurations.
 */
import { Address, hexToBytes } from '@synthesizer-libs/util';
import { EVM } from '../evm.js';
import { Finalizer } from '../tokamak/core/finalizer/index.js';
import { Permutation } from '../tokamak/core/finalizer/permutation.js';
import { createEVM } from '../constructors.js';
import { ExecResult } from '../types.js';
import { PRV_OUT_PLACEMENT_INDEX } from '../tokamak/constant/constants.js';

export class SynthesizerAdapter {
  private rpcUrl: string;
  private isMainnet: boolean;

  constructor(rpcUrl: string, isMainnet: boolean = true) {
    this.rpcUrl = rpcUrl;
    this.isMainnet = isMainnet;
  }

  public get placementIndices(): {
    return: number;
  } {
    return {
      return: PRV_OUT_PLACEMENT_INDEX,
    };
  }

  private async createFreshEVM(txHash: string): Promise<EVM> {
    const evm = await createEVM({
      txHash,
      rpcUrl: this.rpcUrl,
      isMainnet: this.isMainnet,
    });

    // Initialize placements inPts and outPts arrays
    if (evm.synthesizer) {
      evm.synthesizer.state.logPt = [];

      const returnPlacement = evm.synthesizer.state.placements.get(
        PRV_OUT_PLACEMENT_INDEX,
      );
      if (returnPlacement) {
        returnPlacement.inPts = [];
        returnPlacement.outPts = [];
        console.log(
          'SynthesizerAdapter.parseTransaction: Cleared logPt and outPts arrays',
        );
      }
    }

    return evm;
  }

  /**
   * Parses and processes a transaction using RPC state, returning all necessary data structures in memory.
   * @param {string} params.txHash - The transaction hash to process
   * @param {string} params.contractAddr - The contract address (for validation)
   * @param {string} params.calldata - The transaction calldata (for validation)
   * @param {string} params.sender - The transaction sender address (for validation)
   * @returns {Promise<{
   *   evm: EVM,
   *   executionResult: ExecResult,
   *   permutation: Permutation,
   * }>} Returns EVM instance, execution result, and permutation
   */
  public async parseTransaction({
    txHash,
    contractAddr,
    calldata,
    sender,
    outputPath,
  }: {
    txHash: string;
    contractAddr?: string;
    calldata?: string;
    sender?: string;
    outputPath?: string;
  }): Promise<{
    evm: EVM;
    executionResult: ExecResult;
    permutation: Permutation;
  }> {
    // Create EVM with RPC state for the given transaction
    const evm = await this.createFreshEVM(txHash);

    // Get transaction details from RPC
    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider(this.rpcUrl);
    const tx = await provider.getTransaction(txHash);

    if (tx === null || tx.blockNumber === null) {
      throw new Error('Transaction not found or not yet mined');
    }
    if (tx.to === null) {
      throw new Error('Transaction to address is null');
    }
    if (tx.from === null) {
      throw new Error('Transaction from address is null');
    }
    if (tx.data === null) {
      throw new Error('Transaction data is null');
    }

    // Validate provided parameters against actual transaction (if provided)
    if (contractAddr && tx.to.toLowerCase() !== contractAddr.toLowerCase()) {
      throw new Error(
        `Contract address mismatch: expected ${contractAddr}, got ${tx.to}`,
      );
    }
    if (calldata && tx.data.toLowerCase() !== calldata.toLowerCase()) {
      throw new Error(
        `Calldata mismatch: expected ${calldata}, got ${tx.data}`,
      );
    }
    if (sender && tx.from.toLowerCase() !== sender.toLowerCase()) {
      throw new Error(
        `Sender address mismatch: expected ${sender}, got ${tx.from}`,
      );
    }

    const _contractAddr = new Address(hexToBytes(tx.to));
    const _sender = new Address(hexToBytes(tx.from));
    const _calldata = hexToBytes(tx.data);

    // Get the contract code from RPC state
    const contractCode = await evm.stateManager.getCode(_contractAddr);

    const executionResult = await evm.runCode({
      caller: _sender,
      to: _contractAddr,
      code: contractCode,
      data: _calldata,
    });

    // Use Finalizer class to process placements
    const finalizer = new Finalizer(
      executionResult.runState!.synthesizer.state,
    );
    const permutation = await finalizer.exec(outputPath, true); // Write to filesystem with custom path

    return {
      evm,
      executionResult,
      permutation,
    };
  }

  /**
   * Alternative method that directly processes a transaction by hash without additional validation
   * @param {string} txHash - The transaction hash to process
   * @returns {Promise<{
   *   evm: EVM,
   *   executionResult: ExecResult,
   *   permutation: Permutation,
   * }>} Returns EVM instance, execution result, and permutation
   */
  public async parseTransactionByHash(txHash: string): Promise<{
    evm: EVM;
    executionResult: ExecResult;
    permutation: Permutation;
  }> {
    return this.parseTransaction({ txHash });
  }
}
