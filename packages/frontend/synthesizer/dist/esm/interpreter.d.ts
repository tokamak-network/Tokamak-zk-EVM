import { Account } from "@ethereumjs/util/index.js";
import { EvmError } from './exceptions.js';
import { type EVMPerformanceLogger } from './logger.js';
import { Memory } from './memory.js';
import { Message } from './message.js';
import { Stack } from './stack.js';
import { MemoryPt } from './tokamak/pointers/memoryPt.js';
import { StackPt } from './tokamak/pointers/stackPt.js';
import type { EVM } from './evm.js';
import type { Journal } from './journal.js';
import type { Opcode, OpcodeMapEntry } from './opcodes/index.js';
import type { Synthesizer } from './tokamak/core/index.js';
import type { MemoryPts } from './tokamak/pointers/memoryPt.js';
import type { Block, EOFEnv, EVMMockBlockchainInterface, EVMProfilerOpts, Log } from './types.js';
import type { Common, StateManagerInterface, VerkleAccessWitnessInterface } from '@ethereumjs/common/dist/esm/index.js';
import type { Address, PrefixedHexString } from "@ethereumjs/util/index.js";
export interface InterpreterOpts {
    pc?: number;
}
/**
 * Immediate (unprocessed) result of running an EVM bytecode.
 */
export interface RunResult {
    logs: Log[];
    returnValue?: Uint8Array;
    /**
     * A set of accounts to selfdestruct
     */
    selfdestruct: Set<PrefixedHexString>;
    /**
     * A map which tracks which addresses were created (used in EIP 6780)
     */
    createdAddresses?: Set<PrefixedHexString>;
    returnMemoryPts?: MemoryPts;
}
export interface Env {
    address: Address;
    caller: Address;
    callData: Uint8Array;
    callValue: bigint;
    code: Uint8Array;
    isStatic: boolean;
    isCreate: boolean;
    depth: number;
    gasPrice: bigint;
    origin: Address;
    block: Block;
    contract: Account;
    codeAddress: Address;
    gasRefund: bigint;
    eof?: EOFEnv;
    blobVersionedHashes: PrefixedHexString[]; /** Versioned hashes for blob transactions */
    createdAddresses?: Set<string>;
    accessWitness?: VerkleAccessWitnessInterface;
    chargeCodeAccesses?: boolean;
    callMemoryPts: MemoryPts;
}
export interface RunState {
    programCounter: number;
    programCounterPrev: number;
    opCode: number;
    memory: Memory;
    memoryPt: MemoryPt;
    memoryWordCount: bigint;
    highestMemCost: bigint;
    stack: Stack;
    stackPt: StackPt;
    code: Uint8Array;
    shouldDoJumpAnalysis: boolean;
    validJumps: Uint8Array;
    cachedPushes: {
        [pc: number]: bigint;
    };
    stateManager: StateManagerInterface;
    blockchain: EVMMockBlockchainInterface;
    env: Env;
    messageGasLimit?: bigint;
    interpreter: Interpreter;
    gasRefund: bigint;
    gasLeft: bigint;
    returnBytes: Uint8Array;
    synthesizer: Synthesizer;
    returnMemoryPts: MemoryPts;
}
export interface InterpreterResult {
    runState: RunState;
    exceptionError?: EvmError;
}
export interface InterpreterStep {
    gasLeft: bigint;
    gasRefund: bigint;
    stateManager: StateManagerInterface;
    stack: bigint[];
    pc: number;
    depth: number;
    opcode: {
        name: string;
        fee: number;
        dynamicFee?: bigint;
        isAsync: boolean;
    };
    account: Account;
    address: Address;
    memory: Uint8Array;
    memoryWordCount: bigint;
    codeAddress: Address;
}
/**
 * Parses and executes EVM bytecode.
 */
export declare class Interpreter {
    protected _vm: any;
    protected _runState: RunState;
    protected _stateManager: StateManagerInterface;
    protected common: Common;
    _evm: EVM;
    journal: Journal;
    protected _synthesizer: Synthesizer;
    _env: Env;
    _result: RunResult;
    private opDebuggers;
    private profilerOpts?;
    private performanceLogger;
    constructor(evm: EVM, stateManager: StateManagerInterface, blockchain: EVMMockBlockchainInterface, env: Env, gasLeft: bigint, journal: Journal, performanceLogs: EVMPerformanceLogger, synthesizer: Synthesizer, profilerOpts?: EVMProfilerOpts);
    run(code: Uint8Array, opts?: InterpreterOpts): Promise<InterpreterResult>;
    /**
     * Executes the opcode to which the program counter is pointing,
     * reducing its base gas cost, and increments the program counter.
     */
    runStep(opcodeObj?: OpcodeMapEntry): Promise<void>;
    /**
     * Get info for an opcode from EVM's list of opcodes.
     */
    lookupOpInfo(op: number): OpcodeMapEntry;
    _runStepHook(dynamicFee: bigint, gasLeft: bigint): Promise<void>;
    _getValidJumpDestinations(code: Uint8Array): {
        jumps: Uint8Array;
        pushes: {
            [pc: number]: bigint;
        };
        opcodesCached: any[];
    };
    /**
     * Subtracts an amount from the gas counter.
     * @param amount - Amount of gas to consume
     * @param context - Usage context for debugging
     * @throws if out of gas
     */
    useGas(amount: bigint, context?: string | Opcode): void;
    /**
     * Adds a positive amount to the gas counter.
     * @param amount - Amount of gas refunded
     * @param context - Usage context for debugging
     */
    refundGas(amount: bigint, context?: string): void;
    /**
     * Reduces amount of gas to be refunded by a positive value.
     * @param amount - Amount to subtract from gas refunds
     * @param context - Usage context for debugging
     */
    subRefund(amount: bigint, context?: string): void;
    /**
     * Increments the internal gasLeft counter. Used for adding callStipend.
     * @param amount - Amount to add
     */
    addStipend(amount: bigint): void;
    /**
     * Returns balance of the given account.
     * @param address - Address of account
     */
    getExternalBalance(address: Address): Promise<bigint>;
    /**
     * Store 256-bit a value in memory to persistent storage.
     */
    storageStore(key: Uint8Array, value: Uint8Array): Promise<void>;
    /**
     * Loads a 256-bit value to memory from persistent storage.
     * @param key - Storage key
     * @param original - If true, return the original storage value (default: false)
     */
    storageLoad(key: Uint8Array, original?: boolean): Promise<Uint8Array>;
    /**
     * Store 256-bit a value in memory to transient storage.
     * @param address Address to use
     * @param key Storage key
     * @param value Storage value
     */
    transientStorageStore(key: Uint8Array, value: Uint8Array): void;
    /**
     * Loads a 256-bit value to memory from transient storage.
     * @param address Address to use
     * @param key Storage key
     */
    transientStorageLoad(key: Uint8Array): Uint8Array;
    /**
     * Set the returning output data for the execution.
     * @param returnData - Output data to return
     */
    finish(returnData: Uint8Array): void;
    /**
     * Set the memory pointers to the returning output data for the execution.
     * @param returnMemoryPts - The MemoryPt contents for the output data to return
     */
    finishPt(returnMemoryPts: MemoryPts): void;
    /**
     * Set the returning output data for the execution. This will halt the
     * execution immediately and set the execution result to "reverted".
     * @param returnData - Output data to return
     */
    revert(returnData: Uint8Array): void;
    /**
     * Returns address of currently executing account.
     */
    getAddress(): Address;
    /**
     * Returns balance of self.
     */
    getSelfBalance(): bigint;
    /**
     * Returns the deposited value by the instruction/transaction
     * responsible for this execution.
     */
    getCallValue(): bigint;
    /**
     * Returns input data in current environment. This pertains to the input
     * data passed with the message call instruction or transaction.
     */
    getCallData(): Uint8Array;
    /**
     * Returns size of input data in current environment. This pertains to the
     * input data passed with the message call instruction or transaction.
     */
    getCallDataSize(): bigint;
    /**
     * Returns caller address. This is the address of the account
     * that is directly responsible for this execution.
     */
    getCaller(): bigint;
    /**
     * Returns the size of code running in current environment.
     */
    getCodeSize(): bigint;
    /**
     * Returns the code running in current environment.
     */
    getCode(): Uint8Array;
    /**
     * Returns the current gasCounter.
     */
    getGasLeft(): bigint;
    /**
     * Returns size of current return data buffer. This contains the return data
     * from the last executed call, callCode, callDelegate, callStatic or create.
     * Note: create only fills the return data buffer in case of a failure.
     */
    getReturnDataSize(): bigint;
    /**
     * Returns the current return data buffer. This contains the return data
     * from last executed call, callCode, callDelegate, callStatic or create.
     * Note: create only fills the return data buffer in case of a failure.
     */
    getReturnData(): Uint8Array;
    /**
     * Returns the pointers to the aliased data in the current return data buffer. This contains the source pointers to the return data
     * from last executed call, callCode, callDelegate, callStatic or create.
     * Note: create only fills the return data buffer in case of a failure.
     */
    getReturnMemoryPts(): MemoryPts;
    /**
     * Returns true if the current call must be executed statically.
     */
    isStatic(): boolean;
    /**
     * Returns price of gas in current environment.
     */
    getTxGasPrice(): bigint;
    /**
     * Returns the execution's origination address. This is the
     * sender of original transaction; it is never an account with
     * non-empty associated code.
     */
    getTxOrigin(): bigint;
    /**
     * Returns the block’s number.
     */
    getBlockNumber(): bigint;
    /**
     * Returns the block's beneficiary address.
     */
    getBlockCoinbase(): bigint;
    /**
     * Returns the block's timestamp.
     */
    getBlockTimestamp(): bigint;
    /**
     * Returns the block's difficulty.
     */
    getBlockDifficulty(): bigint;
    /**
     * Returns the block's prevRandao field.
     */
    getBlockPrevRandao(): bigint;
    /**
     * Returns the block's gas limit.
     */
    getBlockGasLimit(): bigint;
    /**
     * Returns the Base Fee of the block as proposed in [EIP-3198](https://eips.ethereum.org/EIPS/eip-3198)
     */
    getBlockBaseFee(): bigint;
    /**
     * Returns the Blob Base Fee of the block as proposed in [EIP-7516](https://eips.ethereum.org/EIPS/eip-7516)
     */
    getBlobBaseFee(): bigint;
    /**
     * Returns the chain ID for current chain. Introduced for the
     * CHAINID opcode proposed in [EIP-1344](https://eips.ethereum.org/EIPS/eip-1344).
     */
    getChainId(): bigint;
    /**
     * Sends a message with arbitrary data to a given address path.
     */
    call(gasLimit: bigint, address: Address, value: bigint, data: Uint8Array, memoryPts: MemoryPts): Promise<bigint>;
    /**
     * Message-call into this account with an alternative account's code.
     */
    callCode(gasLimit: bigint, address: Address, value: bigint, data: Uint8Array, memoryPts: MemoryPts): Promise<bigint>;
    /**
     * Sends a message with arbitrary data to a given address path, but disallow
     * state modifications. This includes log, create, selfdestruct and call with
     * a non-zero value.
     */
    callStatic(gasLimit: bigint, address: Address, value: bigint, data: Uint8Array, memoryPts: MemoryPts): Promise<bigint>;
    /**
     * Message-call into this account with an alternative account’s code, but
     * persisting the current values for sender and value.
     */
    callDelegate(gasLimit: bigint, address: Address, value: bigint, data: Uint8Array, memoryPts: MemoryPts): Promise<bigint>;
    _baseCall(msg: Message): Promise<bigint>;
    /**
     * Creates a new contract with a given value.
     */
    create(gasLimit: bigint, value: bigint, codeToRun: Uint8Array, salt?: Uint8Array, eofCallData?: Uint8Array): Promise<bigint>;
    /**
     * Creates a new contract with a given value. Generates
     * a deterministic address via CREATE2 rules.
     */
    create2(gasLimit: bigint, value: bigint, data: Uint8Array, salt: Uint8Array): Promise<bigint>;
    /**
     * Creates a new contract with a given value. Generates
     * a deterministic address via EOFCREATE rules.
     */
    eofcreate(gasLimit: bigint, value: bigint, containerData: Uint8Array, salt: Uint8Array, callData: Uint8Array): Promise<bigint>;
    /**
     * Mark account for later deletion and give the remaining balance to the
     * specified beneficiary address. This will cause a trap and the
     * execution will be aborted immediately.
     * @param toAddress - Beneficiary address
     */
    selfDestruct(toAddress: Address): Promise<void>;
    _selfDestruct(toAddress: Address): Promise<void>;
    /**
     * Creates a new log in the current environment.
     */
    log(data: Uint8Array, numberOfTopics: number, topics: Uint8Array[]): void;
    private _getReturnCode;
}
//# sourceMappingURL=interpreter.d.ts.map