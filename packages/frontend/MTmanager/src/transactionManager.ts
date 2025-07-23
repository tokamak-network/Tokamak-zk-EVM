import { schnorr } from '@noble/curves/secp256k1';
import { poseidon2 } from 'poseidon-bls12381';
import { StateL2, L2DataBaseBySlot } from './L2StateManager';
import { ZkProver } from './ZkProver';
import { ZkVerifier } from './ZKPSystem';
import { EthereumJsExecutionEngine, StateDiff, ExecutionTrace } from './EthereumJsExecutionEngine';
import { getBytecode, getBlockInfo, BlockInfo } from './L1StateManager';
import { createLegacyTx, LegacyTx, LegacyTxData} from '@ethereumjs/tx';
import { addHexPrefix, createAddressFromString, hexToBytes, concatBytes, setLengthLeft, bigIntToBytes} from '@ethereumjs/util';

export function createErc20Transfer(contractAddress: string, to: string, amount: bigint): LegacyTx {
    const txData: LegacyTxData = {
        to: createAddressFromString(addHexPrefix(contractAddress)),
        value: 0n,
        data: concatBytes( ...[
            hexToBytes('0xa9059cbb'), 
            setLengthLeft(hexToBytes(addHexPrefix(to)), 20), 
            setLengthLeft(bigIntToBytes(amount), 32)
        ])
    }
    return createLegacyTx(txData)
}



/**
 * The final transaction object submitted to the L2 network.
 */
export interface SignedL2Transaction {
  transaction: L2Transaction;
  signature: string; // Poseidon-Schnorr signature
}

// --- Helper Functions for Signing ---

// Hashes a transaction object using Poseidon.
function hashL2Transaction(tx: L2Transaction): Uint8Array {
  const message = JSON.stringify(tx);
  const messageBytes = new TextEncoder().encode(message);
  const hash = poseidon2([BigInt('0x' + Buffer.from(messageBytes).toString('hex'))]);
  let hex = hash.toString(16);
  if (hex.length % 2) {
    hex = '0' + hex;
  }
  const hashBytes = hexToBytes(hex);

  if (hashBytes.length > 32) {
    return hashBytes.slice(0, 32);
  } else {
    const padded = new Uint8Array(32);
    padded.set(hashBytes, 32 - hashBytes.length);
    return padded;
  }
}

// --- Key Management ---

export function generateKeys(): { privateKey: string; publicKey: string } {
  const privateKey = schnorr.utils.randomPrivateKey();
  const publicKey = schnorr.getPublicKey(privateKey);
  return {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
  };
}

// --- Main Transaction Manager Class ---

export class TransactionManager {
  private privateKey: string;
  public publicKey: string;
  private l2StateManager: StateL2;
  private currentNonce: number;

  constructor(l2StateManager: StateL2, privateKey?: string) {
    if (privateKey) {
        this.privateKey = privateKey;
        this.publicKey = bytesToHex(schnorr.getPublicKey(hexToBytes(privateKey)));
    } else {
        const keys = generateKeys();
        this.privateKey = keys.privateKey;
        this.publicKey = keys.publicKey;
    }
    this.l2StateManager = l2StateManager;
    this.currentNonce = 0; // In a real system, this should be fetched from the state
  }

  /**
   * Creates and signs an L2 transaction.
   * @param to The smart contract address.
   * @param data The calldata for the function call.
   * @returns A signed L2 transaction object.
   */
  public async createAndSignTransaction(to: string, data: string): Promise<SignedL2Transaction> {
    const transaction: L2Transaction = {
      from: this.publicKey,
      to: to,
      nonce: this.currentNonce,
      data: data,
    };

    const txHash = hashL2Transaction(transaction);
    const signature = await schnorr.sign(txHash, hexToBytes(this.privateKey));

    this.currentNonce++; // Increment nonce for the next transaction

    return {
      transaction,
      signature: bytesToHex(signature),
    };
  }

  /**
   * Submits a signed transaction to the L2 network.
   * This involves signature verification, ZKP generation/verification, and state update.
   * @param signedTx The signed L2 transaction.
   * @param blockNumber The L1 block number to use for context.
   * @returns A boolean indicating if the transaction was successful.
   */
  public async submitTransaction(signedTx: SignedL2Transaction, blockNumber: number): Promise<boolean> {
    console.log(`\n[TM] Submitting transaction with nonce ${signedTx.transaction.nonce}...`);

    // 1. Verify Signature
    const txHash = hashL2Transaction(signedTx.transaction);
    const isValidSignature = await schnorr.verify(hexToBytes(signedTx.signature), txHash, hexToBytes(signedTx.transaction.from));

    if (!isValidSignature) {
      console.error("[TM] Signature verification failed. Transaction rejected.");
      return false;
    }
    console.log("[TM] Signature verified successfully.");

    // 2. Get Contract Bytecode and Block Info from L1
    const bytecode = await getBytecode(signedTx.transaction.to, blockNumber);
    if (bytecode === '0x') {
        console.error(`[TM] No bytecode found for contract ${signedTx.transaction.to}. Transaction rejected.`);
        return false;
    }
    const blockInfo = await getBlockInfo(blockNumber);

    // 2-A. Execute Transaction and Prepare State Update
    console.log("[TM] Executing transaction with ExecutionEngine...");
    let executionTrace: ExecutionTrace;
    let stateDiff: StateDiff;
    try {
        const executionResult = await EthereumJsExecutionEngine.execute(signedTx.transaction, bytecode, this.l2StateManager.dbBySlot);
        executionTrace = executionResult.trace;
        stateDiff = executionResult.diff;
    } catch (error) {
        console.error("[TM] ExecutionEngine failed:", error);
        return false;
    }
    
    this.l2StateManager.prepareUpdate(stateDiff);
    if (!this.l2StateManager.pending) {
        console.error("[TM] L2StateManager failed to prepare update.");
        return false;
    }

    // 2-B. Generate ZK Proof
    console.log("[TM] Generating ZK Proof...");
    const proof = ZkProver.generateProof(
        this.l2StateManager.pending.oldRoots,
        this.l2StateManager.pending.newRoots,
        this.l2StateManager.pending.oldRawLeaves,
        this.l2StateManager.pending.newRawLeaves,
        signedTx.transaction.data,
        bytecode,
        blockInfo
    );
    console.log("[TM] ZK Proof generated.");

    // 3. Verify ZK Proof
    console.log("[TM] Verifying ZK Proof...");
    const isProofValid = ZkVerifier.verify(proof);
    if (!isProofValid) {
      console.error("[TM] ZK Verifier rejected the proof. Transaction rejected.");
      // Important: If proof fails, we should revert the pending state in L2StateManager
      this.l2StateManager.pending = null; // Clear pending state
      return false;
    }
    console.log("[TM] ZK Verifier accepted the proof.");

    // 4. Commit State Update
    console.log("[TM] Committing state update to L2 State Manager...");
    this.l2StateManager.commitUpdate();
    console.log("[TM] State updated successfully.");

    return true;
  }
}
