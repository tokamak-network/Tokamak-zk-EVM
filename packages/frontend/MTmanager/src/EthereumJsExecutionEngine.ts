import { VM , createVM, runTx} from '@ethereumjs/vm';
import { Common, Chain, Mainnet, Hardfork } from '@ethereumjs/common';
import { MerkleStateManager } from '@ethereumjs/statemanager'

import { Address, hexToBytes, addHexPrefix, setLengthLeft, bigIntToBytes, concatBytes  } from '@ethereumjs/util'
import { keccak256 } from 'ethereum-cryptography/keccak.js'
import { LegacyTx } from '@ethereumjs/tx';
import { L1DataBaseBySlot } from './L1StateManager';
import { Trie } from '@ethereumjs/util';
import { Blockchain } from '@ethereumjs/blockchain';
import { Block, BlockHeader } from '@ethereumjs/block';

// Defines the structure of a single state change.
export interface StateChange {
    slot: number;
    l2Addr: string;
    newValue: bigint;
}

export type StateDiff = StateChange[];

// A simplified representation of the detailed execution trace.
export type ExecutionTrace = string;

// Assuming L2Transaction might have a value field
interface L2TransactionWithOptionalValue extends L2Transaction {
    value?: bigint;
}

/**
 * Executes a transaction using EthereumJS VM.
 * @param blockInfo Block information from L1StateManager, used to configure the blockchain.
 * @param reconstructedL1Db Reconstructed L1 state from L2StateManager, used to initialize the stateManager.
 * @param bytecode Bytecode of the target contract, obtained from L1StateManager.
 * @param transaction The L2 transaction from transactionManager.
 * @returns An object containing the simulated trace and the state diff.
 */
export const executeContractCallTransaction = async (
    transaction: LegacyTx,
    blockHeader: BlockHeader, 
    contractState: MerkleStateManager,
    
): Promise<{ trace: ExecutionTrace, diff: StateDiff }> => {
    console.log(`[EthJsExecEngine] Executing tx for contract ${ca} using EthereumJS VM...`);
    await runTx

    const common = new Common({ chain: Mainnet, hardfork: Hardfork.Shanghai })
    const vm = await createVM({ common, stateManager, blockchain });

    // Create EthereumJS transaction object
    const ethJsTx = TransactionFactory.fromTxData({
        nonce: BigInt(transaction.nonce),
        gasPrice: 1n, // Dummy value
        gasLimit: 1000000n, // Sufficiently large dummy value
        to: Address.fromString(transaction.to),
        value: transaction.value || 0n, // Use transaction.value if exists, else 0n
        data: Buffer.from(transaction.data.substring(2), 'hex'),
        // from: Address.fromString(transaction.from), // 'from' is not part of TxData for unsigned tx
    }, { common });

    // Sign the transaction with a dummy private key for vm.runTx
    const dummyPrivateKey = Buffer.from('1111111111111111111111111111111111111111111111111111111111111111', 'hex');
    const signedEthJsTx = ethJsTx.sign(dummyPrivateKey);

    // Execute the transaction using vm.runTx
    const runCallResult = await vm.runTx({ tx: signedEthJsTx });

    if (runCallResult.execResult.exceptionError) {
        console.error("[EthJsExecEngine] VM execution exception:", runCallResult.execResult.exceptionError);
        throw runCallResult.execResult.exceptionError;
    }

    const trace: ExecutionTrace = `EthereumJS VM executed. Gas Used: ${(runCallResult as any).totalGasUsed}`;
    
    // To get the state diff, we need to compare the stateTrie before and after the transaction.
    // MerkleStateManager doesn't expose a direct "getChanges" method. You would typically compare
    // the state root before and after, and then use a diffing mechanism if detailed changes are needed.
    const diff: StateDiff = []; // Placeholder for now, actual diffing logic would be complex

    console.log(`[EthJsExecEngine] Execution finished. Generated trace and state diff.`);
    return { trace, diff };
};