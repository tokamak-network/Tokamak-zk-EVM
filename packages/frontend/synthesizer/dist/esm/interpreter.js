import { ConsensusAlgorithm } from '@ethereumjs/common/dist/esm/index.js';
import { Account, BIGINT_0, BIGINT_1, BIGINT_2, MAX_UINT64, bigIntToHex, bytesToBigInt, bytesToHex, equalsBytes, } from "@ethereumjs/util/index.js";
import debugDefault from 'debug';
import readline from 'readline';
import { FORMAT, MAGIC, VERSION } from './eof/constants.js';
import { EOFContainerMode, validateEOF } from './eof/container.js';
import { setupEOF } from './eof/setup.js';
import { ContainerSectionType } from './eof/verify.js';
import { ERROR, EvmError } from './exceptions.js';
import { Memory } from './memory.js';
import { Message } from './message.js';
import { trap } from './opcodes/index.js';
import { Stack } from './stack.js';
import { MemoryPt } from './tokamak/pointers/memoryPt.js';
import { StackPt } from './tokamak/pointers/stackPt.js';
import { arrToStr, mapToStr } from './tokamak/utils/index.js';
const debugGas = debugDefault('evm:gas');
/**
 * Parses and executes EVM bytecode.
 */
export class Interpreter {
    // TODO remove gasLeft as constructor argument
    constructor(evm, stateManager, blockchain, env, gasLeft, journal, performanceLogs, synthesizer, profilerOpts) {
        // Opcode debuggers (e.g. { 'push': [debug Object], 'sstore': [debug Object], ...})
        this.opDebuggers = {};
        this._evm = evm;
        this._stateManager = stateManager;
        this.common = this._evm.common;
        if (this.common.consensusType() === 'poa' &&
            this._evm['_optsCached'].cliqueSigner === undefined)
            throw new Error('Must include cliqueSigner function if clique/poa is being used for consensus type');
        this._runState = {
            programCounter: 0,
            programCounterPrev: 0,
            opCode: 0xfe,
            memory: new Memory(),
            memoryPt: new MemoryPt(),
            memoryWordCount: BIGINT_0,
            highestMemCost: BIGINT_0,
            stack: new Stack(),
            stackPt: new StackPt(),
            code: new Uint8Array(0),
            validJumps: Uint8Array.from([]),
            cachedPushes: {},
            stateManager: this._stateManager,
            blockchain,
            env,
            shouldDoJumpAnalysis: true,
            interpreter: this,
            gasRefund: env.gasRefund,
            gasLeft,
            returnBytes: new Uint8Array(0),
            synthesizer,
            returnMemoryPts: [],
        };
        this.journal = journal;
        this._env = env;
        this._result = {
            logs: [],
            returnValue: undefined,
            selfdestruct: new Set(),
            returnMemoryPts: undefined,
        };
        this.profilerOpts = profilerOpts;
        this.performanceLogger = performanceLogs;
        this._synthesizer = synthesizer;
    }
    async run(code, opts = {}) {
        if (!this.common.isActivatedEIP(3540) || code[0] !== FORMAT) {
            // EIP-3540 isn't active and first byte is not 0xEF - treat as legacy bytecode
            this._runState.code = code;
        }
        else if (this.common.isActivatedEIP(3540)) {
            if (code[1] !== MAGIC) {
                // Bytecode contains invalid EOF magic byte
                return {
                    runState: this._runState,
                    exceptionError: new EvmError(ERROR.INVALID_BYTECODE_RESULT),
                };
            }
            if (code[2] !== VERSION) {
                // Bytecode contains invalid EOF version number
                return {
                    runState: this._runState,
                    exceptionError: new EvmError(ERROR.INVALID_EOF_FORMAT),
                };
            }
            this._runState.code = code;
            const isTxCreate = this._env.isCreate && this._env.depth === 0;
            const eofMode = isTxCreate ? EOFContainerMode.TxInitmode : EOFContainerMode.Default;
            try {
                setupEOF(this._runState, eofMode);
            }
            catch (e) {
                return {
                    runState: this._runState,
                    exceptionError: new EvmError(ERROR.INVALID_EOF_FORMAT), // TODO: verify if all gas should be consumed
                };
            }
            if (isTxCreate) {
                // Tx tries to deploy container
                try {
                    validateEOF(this._runState.code, this._evm, ContainerSectionType.InitCode, EOFContainerMode.TxInitmode);
                }
                catch (e) {
                    // Trying to deploy an invalid EOF container
                    return {
                        runState: this._runState,
                        exceptionError: new EvmError(ERROR.INVALID_EOF_FORMAT), // TODO: verify if all gas should be consumed
                    };
                }
            }
        }
        this._runState.programCounter = opts.pc ?? this._runState.programCounter;
        // Check that the programCounter is in range
        const pc = this._runState.programCounter;
        if (pc !== 0 && (pc < 0 || pc >= this._runState.code.length)) {
            throw new Error('Internal error: program counter not in range');
        }
        let err;
        let cachedOpcodes;
        let doJumpAnalysis = true;
        let timer;
        let overheadTimer;
        if (this.profilerOpts?.enabled === true && this.performanceLogger.hasTimer()) {
            timer = this.performanceLogger.pauseTimer();
            overheadTimer = this.performanceLogger.startTimer('Overhead');
        }
        // Iterate through the given ops until something breaks or we hit STOP
        while (this._runState.programCounter < this._runState.code.length) {
            const programCounter = this._runState.programCounter;
            let opCode;
            let opCodeObj;
            if (doJumpAnalysis) {
                opCode = this._runState.code[programCounter];
                // Only run the jump destination analysis if `code` actually contains a JUMP/JUMPI/JUMPSUB opcode
                if (opCode === 0x56 || opCode === 0x57 || opCode === 0x5e) {
                    const { jumps, pushes, opcodesCached } = this._getValidJumpDestinations(this._runState.code);
                    this._runState.validJumps = jumps;
                    this._runState.cachedPushes = pushes;
                    this._runState.shouldDoJumpAnalysis = false;
                    cachedOpcodes = opcodesCached;
                    doJumpAnalysis = false;
                }
            }
            else {
                opCodeObj = cachedOpcodes[programCounter];
                opCode = opCodeObj.opcodeInfo.code;
            }
            // if its an invalid opcode with verkle activated, then check if its because of a missing code
            // chunk in the witness, and throw appropriate error to distinguish from an actual invalid opcode
            if (opCode === 0xfe &&
                this.common.isActivatedEIP(6800) &&
                // is this a code loaded from state using witnesses
                this._runState.env.chargeCodeAccesses === true) {
                const contract = this._runState.interpreter.getAddress();
                if (!(await this._runState.stateManager.checkChunkWitnessPresent(contract, programCounter))) {
                    throw Error(`Invalid witness with missing codeChunk for pc=${programCounter}`);
                }
            }
            this._runState.opCode = opCode;
            try {
                if (overheadTimer !== undefined) {
                    this.performanceLogger.pauseTimer();
                }
                this._runState.programCounterPrev = this._runState.programCounter;
                await this.runStep(opCodeObj);
                if (overheadTimer !== undefined) {
                    this.performanceLogger.unpauseTimer(overheadTimer);
                }
            }
            catch (e) {
                if (overheadTimer !== undefined) {
                    this.performanceLogger.unpauseTimer(overheadTimer);
                }
                // re-throw on non-VM errors
                if (!('errorType' in e && e.errorType === 'EvmError')) {
                    throw e;
                }
                // STOP is not an exception
                if (e.error !== ERROR.STOP) {
                    err = e;
                }
                break;
            }
        }
        if (timer !== undefined) {
            this.performanceLogger.stopTimer(overheadTimer, 0);
            this.performanceLogger.unpauseTimer(timer);
        }
        return {
            runState: this._runState,
            exceptionError: err,
        };
    }
    /**
     * Executes the opcode to which the program counter is pointing,
     * reducing its base gas cost, and increments the program counter.
     */
    async runStep(opcodeObj) {
        const opEntry = opcodeObj ?? this.lookupOpInfo(this._runState.opCode);
        const opInfo = opEntry.opcodeInfo;
        let timer;
        if (this.profilerOpts?.enabled === true) {
            timer = this.performanceLogger.startTimer(opInfo.name);
        }
        let gas = opInfo.feeBigInt;
        try {
            if (opInfo.dynamicGas) {
                // This function updates the gas in-place.
                // It needs the base fee, for correct gas limit calculation for the CALL opcodes
                gas = await opEntry.gasHandler(this._runState, gas, this.common);
            }
            if (this.common.isActivatedEIP(6800) && this._env.chargeCodeAccesses === true) {
                const contract = this._runState.interpreter.getAddress();
                const statelessGas = this._runState.env.accessWitness.touchCodeChunksRangeOnReadAndChargeGas(contract, this._runState.programCounter, this._runState.programCounter);
                gas += statelessGas;
                debugGas(`codechunk accessed statelessGas=${statelessGas} (-> ${gas})`);
            }
            if (this._evm.events.listenerCount('step') > 0 || this._evm.DEBUG) {
                // Only run this stepHook function if there is an event listener (e.g. test runner)
                // or if the vm is running in debug mode (to display opcode debug logs)
                await this._runStepHook(gas, this.getGasLeft());
            }
            // Check for invalid opcode
            if (opInfo.isInvalid) {
                throw new EvmError(ERROR.INVALID_OPCODE);
            }
            // Reduce opcode's base fee
            this.useGas(gas, opInfo);
            // Advance program counter
            this._runState.programCounter++;
            // Execute opcode handler
            const opFn = opEntry.opHandler;
            // 2. 일반 opcode 실행
            if (opInfo.isAsync) {
                await opFn.apply(null, [this._runState, this.common]);
            }
            else {
                opFn.apply(null, [this._runState, this.common]);
            }
        }
        finally {
            if (this.profilerOpts?.enabled === true) {
                this.performanceLogger.stopTimer(timer, Number(gas), 'opcodes', opInfo.fee, Number(gas) - opInfo.fee);
            }
        }
    }
    /**
     * Get info for an opcode from EVM's list of opcodes.
     */
    lookupOpInfo(op) {
        return this._evm._opcodeMap[op];
    }
    async _runStepHook(dynamicFee, gasLeft) {
        const opcodeInfo = this.lookupOpInfo(this._runState.opCode);
        const opcode = opcodeInfo.opcodeInfo;
        const eventObj = {
            pc: this._runState.programCounter,
            gasLeft,
            gasRefund: this._runState.gasRefund,
            opcode: {
                name: opcode.fullName,
                fee: opcode.fee,
                dynamicFee,
                isAsync: opcode.isAsync,
            },
            stack: this._runState.stack.getStack(),
            depth: this._env.depth,
            address: this._env.address,
            account: this._env.contract,
            memory: this._runState.memory._store.subarray(0, Number(this._runState.memoryWordCount) * 32),
            memoryWordCount: this._runState.memoryWordCount,
            codeAddress: this._env.codeAddress,
            stateManager: this._runState.stateManager,
        };
        if (this._evm.DEBUG) {
            // Create opTrace for debug functionality
            let hexStack = [];
            hexStack = eventObj.stack.map((item) => {
                return bigIntToHex(BigInt(item));
            });
            /*eslint-disable */
            function waitForCommand(targetCommand = 'continue') {
                return new Promise((resolve) => {
                    const rl = readline.createInterface({
                        input: process.stdin,
                        output: process.stdout,
                    });
                    rl.question(`Type "${targetCommand}" to continue: `, (input) => {
                        if (input.trim() === targetCommand) {
                            rl.close();
                            resolve();
                        }
                        else {
                            console.log(`Invalid command. Please type "${targetCommand}" to proceed.`);
                            rl.close();
                            waitForCommand(targetCommand).then(resolve); // 다시 대기
                        }
                    });
                });
            }
            const stringMemory = Buffer.from(this._runState.memory._store).toString('hex');
            const stringMemoryPt = mapToStr(this._runState.memoryPt._storePt);
            const name = eventObj.opcode.name;
            const opTrace = {
                pc: eventObj.pc,
                op: name,
                gas: bigIntToHex(eventObj.gasLeft),
                gasCost: bigIntToHex(dynamicFee),
                stack: hexStack,
                depth: eventObj.depth,
            };
            // console.log(`"memory": ${JSON.stringify(eventObj.memory)}\n`)
            console.log(`"memory": ${stringMemory.slice(0, 256)}\n`);
            console.log(`"stackPt": ${JSON.stringify(this._runState.stackPt.getStack(), arrToStr, 2)}\n`);
            console.log(`"memoryPt": ${JSON.stringify(stringMemoryPt, null, 1)}\n`);
            if (!(name in this.opDebuggers)) {
                this.opDebuggers[name] = debugDefault(`evm:ops:${name}`);
            }
            this.opDebuggers[name](JSON.stringify(opTrace));
            await waitForCommand('c');
        }
        /**
         * The `step` event for trace output
         *
         * @event Event: step
         * @type {Object}
         * @property {Number} pc representing the program counter
         * @property {Object} opcode the next opcode to be ran
         * @property {string}     opcode.name
         * @property {fee}        opcode.number Base fee of the opcode
         * @property {dynamicFee} opcode.dynamicFee Dynamic opcode fee
         * @property {boolean}    opcode.isAsync opcode is async
         * @property {BigInt} gasLeft amount of gasLeft
         * @property {BigInt} gasRefund gas refund
         * @property {StateManager} stateManager a {@link StateManager} instance
         * @property {Array} stack an `Array` of `Uint8Arrays` containing the stack
         * @property {Array} returnStack the return stack
         * @property {Account} account the Account which owns the code running
         * @property {Address} address the address of the `account`
         * @property {Number} depth the current number of calls deep the contract is
         * @property {Uint8Array} memory the memory of the EVM as a `Uint8Array`
         * @property {BigInt} memoryWordCount current size of memory in words
         * @property {Address} codeAddress the address of the code which is currently being ran (this differs from `address` in a `DELEGATECALL` and `CALLCODE` call)
         */
        await this._evm._emit('step', eventObj);
    }
    // Returns all valid jump and jumpsub destinations.
    _getValidJumpDestinations(code) {
        const jumps = new Uint8Array(code.length);
        const pushes = {};
        const opcodesCached = Array(code.length);
        for (let i = 0; i < code.length; i++) {
            const opcode = code[i];
            opcodesCached[i] = this.lookupOpInfo(opcode);
            // skip over PUSH0-32 since no jump destinations in the middle of a push block
            if (opcode <= 0x7f) {
                if (opcode >= 0x60) {
                    const extraSteps = opcode - 0x5f;
                    const push = bytesToBigInt(code.slice(i + 1, i + opcode - 0x5e));
                    pushes[i + 1] = push;
                    i += extraSteps;
                }
                else if (opcode === 0x5b) {
                    // Define a JUMPDEST as a 1 in the valid jumps array
                    jumps[i] = 1;
                }
            }
        }
        return { jumps, pushes, opcodesCached };
    }
    /**
     * Subtracts an amount from the gas counter.
     * @param amount - Amount of gas to consume
     * @param context - Usage context for debugging
     * @throws if out of gas
     */
    useGas(amount, context) {
        this._runState.gasLeft -= amount;
        if (this._evm.DEBUG) {
            let tempString = '';
            if (typeof context === 'string') {
                tempString = context + ': ';
            }
            else if (context !== undefined) {
                tempString = `${context.name} fee: `;
            }
            debugGas(`${tempString}used ${amount} gas (-> ${this._runState.gasLeft})`);
        }
        if (this._runState.gasLeft < BIGINT_0) {
            this._runState.gasLeft = BIGINT_0;
            trap(ERROR.OUT_OF_GAS);
        }
    }
    /**
     * Adds a positive amount to the gas counter.
     * @param amount - Amount of gas refunded
     * @param context - Usage context for debugging
     */
    refundGas(amount, context) {
        if (this._evm.DEBUG) {
            debugGas(`${typeof context === 'string' ? context + ': ' : ''}refund ${amount} gas (-> ${this._runState.gasRefund})`);
        }
        this._runState.gasRefund += amount;
    }
    /**
     * Reduces amount of gas to be refunded by a positive value.
     * @param amount - Amount to subtract from gas refunds
     * @param context - Usage context for debugging
     */
    subRefund(amount, context) {
        if (this._evm.DEBUG) {
            debugGas(`${typeof context === 'string' ? context + ': ' : ''}sub gas refund ${amount} (-> ${this._runState.gasRefund})`);
        }
        this._runState.gasRefund -= amount;
        if (this._runState.gasRefund < BIGINT_0) {
            this._runState.gasRefund = BIGINT_0;
            trap(ERROR.REFUND_EXHAUSTED);
        }
    }
    /**
     * Increments the internal gasLeft counter. Used for adding callStipend.
     * @param amount - Amount to add
     */
    addStipend(amount) {
        if (this._evm.DEBUG) {
            debugGas(`add stipend ${amount} (-> ${this._runState.gasLeft})`);
        }
        this._runState.gasLeft += amount;
    }
    /**
     * Returns balance of the given account.
     * @param address - Address of account
     */
    async getExternalBalance(address) {
        // shortcut if current account
        if (address.equals(this._env.address)) {
            return this._env.contract.balance;
        }
        let account = await this._stateManager.getAccount(address);
        if (!account) {
            account = new Account();
        }
        return account.balance;
    }
    /**
     * Store 256-bit a value in memory to persistent storage.
     */
    async storageStore(key, value) {
        await this._stateManager.putStorage(this._env.address, key, value);
        const account = await this._stateManager.getAccount(this._env.address);
        if (!account) {
            throw new Error('could not read account while persisting memory');
        }
        this._env.contract = account;
    }
    /**
     * Loads a 256-bit value to memory from persistent storage.
     * @param key - Storage key
     * @param original - If true, return the original storage value (default: false)
     */
    async storageLoad(key, original = false) {
        if (original) {
            return this._stateManager.originalStorageCache.get(this._env.address, key);
        }
        else {
            return this._stateManager.getStorage(this._env.address, key);
        }
    }
    /**
     * Store 256-bit a value in memory to transient storage.
     * @param address Address to use
     * @param key Storage key
     * @param value Storage value
     */
    transientStorageStore(key, value) {
        return this._evm.transientStorage.put(this._env.address, key, value);
    }
    /**
     * Loads a 256-bit value to memory from transient storage.
     * @param address Address to use
     * @param key Storage key
     */
    transientStorageLoad(key) {
        return this._evm.transientStorage.get(this._env.address, key);
    }
    /**
     * Set the returning output data for the execution.
     * @param returnData - Output data to return
     */
    finish(returnData) {
        this._result.returnValue = returnData;
        trap(ERROR.STOP);
    }
    /**
     * Set the memory pointers to the returning output data for the execution.
     * @param returnMemoryPts - The MemoryPt contents for the output data to return
     */
    finishPt(returnMemoryPts) {
        this._result.returnMemoryPts = returnMemoryPts;
    }
    /**
     * Set the returning output data for the execution. This will halt the
     * execution immediately and set the execution result to "reverted".
     * @param returnData - Output data to return
     */
    revert(returnData) {
        this._result.returnValue = returnData;
        trap(ERROR.REVERT);
    }
    /**
     * Returns address of currently executing account.
     */
    getAddress() {
        return this._env.address;
    }
    /**
     * Returns balance of self.
     */
    getSelfBalance() {
        return this._env.contract.balance;
    }
    /**
     * Returns the deposited value by the instruction/transaction
     * responsible for this execution.
     */
    getCallValue() {
        return this._env.callValue;
    }
    /**
     * Returns input data in current environment. This pertains to the input
     * data passed with the message call instruction or transaction.
     */
    getCallData() {
        return this._env.callData;
    }
    /**
     * Returns size of input data in current environment. This pertains to the
     * input data passed with the message call instruction or transaction.
     */
    getCallDataSize() {
        return BigInt(this._env.callData.length);
    }
    /**
     * Returns caller address. This is the address of the account
     * that is directly responsible for this execution.
     */
    getCaller() {
        return bytesToBigInt(this._env.caller.bytes);
    }
    /**
     * Returns the size of code running in current environment.
     */
    getCodeSize() {
        return BigInt(this._env.code.length);
    }
    /**
     * Returns the code running in current environment.
     */
    getCode() {
        return this._env.code;
    }
    /**
     * Returns the current gasCounter.
     */
    getGasLeft() {
        return this._runState.gasLeft;
    }
    /**
     * Returns size of current return data buffer. This contains the return data
     * from the last executed call, callCode, callDelegate, callStatic or create.
     * Note: create only fills the return data buffer in case of a failure.
     */
    getReturnDataSize() {
        return BigInt(this._runState.returnBytes.length);
    }
    /**
     * Returns the current return data buffer. This contains the return data
     * from last executed call, callCode, callDelegate, callStatic or create.
     * Note: create only fills the return data buffer in case of a failure.
     */
    getReturnData() {
        return this._runState.returnBytes;
    }
    /**
     * Returns the pointers to the aliased data in the current return data buffer. This contains the source pointers to the return data
     * from last executed call, callCode, callDelegate, callStatic or create.
     * Note: create only fills the return data buffer in case of a failure.
     */
    getReturnMemoryPts() {
        return this._runState.returnMemoryPts;
    }
    /**
     * Returns true if the current call must be executed statically.
     */
    isStatic() {
        return this._env.isStatic;
    }
    /**
     * Returns price of gas in current environment.
     */
    getTxGasPrice() {
        return this._env.gasPrice;
    }
    /**
     * Returns the execution's origination address. This is the
     * sender of original transaction; it is never an account with
     * non-empty associated code.
     */
    getTxOrigin() {
        return bytesToBigInt(this._env.origin.bytes);
    }
    /**
     * Returns the block’s number.
     */
    getBlockNumber() {
        return this._env.block.header.number;
    }
    /**
     * Returns the block's beneficiary address.
     */
    getBlockCoinbase() {
        let coinbase;
        if (this.common.consensusAlgorithm() === ConsensusAlgorithm.Clique) {
            coinbase = this._evm['_optsCached'].cliqueSigner(this._env.block.header);
        }
        else {
            coinbase = this._env.block.header.coinbase;
        }
        return bytesToBigInt(coinbase.toBytes());
    }
    /**
     * Returns the block's timestamp.
     */
    getBlockTimestamp() {
        return this._env.block.header.timestamp;
    }
    /**
     * Returns the block's difficulty.
     */
    getBlockDifficulty() {
        return this._env.block.header.difficulty;
    }
    /**
     * Returns the block's prevRandao field.
     */
    getBlockPrevRandao() {
        return bytesToBigInt(this._env.block.header.prevRandao);
    }
    /**
     * Returns the block's gas limit.
     */
    getBlockGasLimit() {
        return this._env.block.header.gasLimit;
    }
    /**
     * Returns the Base Fee of the block as proposed in [EIP-3198](https://eips.ethereum.org/EIPS/eip-3198)
     */
    getBlockBaseFee() {
        const baseFee = this._env.block.header.baseFeePerGas;
        if (baseFee === undefined) {
            // Sanity check
            throw new Error('Block has no Base Fee');
        }
        return baseFee;
    }
    /**
     * Returns the Blob Base Fee of the block as proposed in [EIP-7516](https://eips.ethereum.org/EIPS/eip-7516)
     */
    getBlobBaseFee() {
        const blobBaseFee = this._env.block.header.getBlobGasPrice();
        if (blobBaseFee === undefined) {
            // Sanity check
            throw new Error('Block has no Blob Base Fee');
        }
        return blobBaseFee;
    }
    /**
     * Returns the chain ID for current chain. Introduced for the
     * CHAINID opcode proposed in [EIP-1344](https://eips.ethereum.org/EIPS/eip-1344).
     */
    getChainId() {
        return this.common.chainId();
    }
    /**
     * Sends a message with arbitrary data to a given address path.
     */
    async call(gasLimit, address, value, data, memoryPts) {
        const msg = new Message({
            caller: this._env.address,
            gasLimit,
            to: address,
            value,
            data,
            isStatic: this._env.isStatic,
            depth: this._env.depth + 1,
            blobVersionedHashes: this._env.blobVersionedHashes,
            accessWitness: this._env.accessWitness,
            memoryPts,
        });
        return this._baseCall(msg);
    }
    /**
     * Message-call into this account with an alternative account's code.
     */
    async callCode(gasLimit, address, value, data, memoryPts) {
        const msg = new Message({
            caller: this._env.address,
            gasLimit,
            to: this._env.address,
            codeAddress: address,
            value,
            data,
            isStatic: this._env.isStatic,
            depth: this._env.depth + 1,
            blobVersionedHashes: this._env.blobVersionedHashes,
            accessWitness: this._env.accessWitness,
            memoryPts,
        });
        return this._baseCall(msg);
    }
    /**
     * Sends a message with arbitrary data to a given address path, but disallow
     * state modifications. This includes log, create, selfdestruct and call with
     * a non-zero value.
     */
    async callStatic(gasLimit, address, value, data, memoryPts) {
        const msg = new Message({
            caller: this._env.address,
            gasLimit,
            to: address,
            value,
            data,
            isStatic: true,
            depth: this._env.depth + 1,
            blobVersionedHashes: this._env.blobVersionedHashes,
            accessWitness: this._env.accessWitness,
            memoryPts,
        });
        return this._baseCall(msg);
    }
    /**
     * Message-call into this account with an alternative account’s code, but
     * persisting the current values for sender and value.
     */
    async callDelegate(gasLimit, address, value, data, memoryPts) {
        const msg = new Message({
            caller: this._env.caller,
            gasLimit,
            to: this._env.address,
            codeAddress: address,
            value,
            data,
            isStatic: this._env.isStatic,
            delegatecall: true,
            depth: this._env.depth + 1,
            blobVersionedHashes: this._env.blobVersionedHashes,
            accessWitness: this._env.accessWitness,
            memoryPts,
        });
        return this._baseCall(msg);
    }
    async _baseCall(msg) {
        const selfdestruct = new Set(this._result.selfdestruct);
        msg.selfdestruct = selfdestruct;
        msg.gasRefund = this._runState.gasRefund;
        // empty the return data Uint8Array
        this._runState.returnBytes = new Uint8Array(0);
        let createdAddresses;
        if (this.common.isActivatedEIP(6780)) {
            createdAddresses = new Set(this._result.createdAddresses);
            msg.createdAddresses = createdAddresses;
        }
        // empty the return data Uint8Array
        this._runState.returnBytes = new Uint8Array(0);
        // Check if account has enough ether and max depth not exceeded
        if (this._env.depth >= Number(this.common.param('stackLimit')) ||
            (msg.delegatecall !== true && this._env.contract.balance < msg.value)) {
            return BIGINT_0;
        }
        const results = await this._evm.runCall({ message: msg });
        if (results.execResult.logs) {
            this._result.logs = this._result.logs.concat(results.execResult.logs);
        }
        // this should always be safe
        this.useGas(results.execResult.executionGasUsed, 'CALL, STATICCALL, DELEGATECALL, CALLCODE');
        // Set return value
        if (results.execResult.returnValue !== undefined &&
            (!results.execResult.exceptionError ||
                results.execResult.exceptionError.error === ERROR.REVERT)) {
            this._runState.returnBytes = results.execResult.returnValue;
            // For synthesizer
            if (results.execResult.returnMemoryPts) {
                this._runState.returnMemoryPts = results.execResult.returnMemoryPts;
            }
        }
        if (!results.execResult.exceptionError) {
            for (const addressToSelfdestructHex of selfdestruct) {
                this._result.selfdestruct.add(addressToSelfdestructHex);
            }
            if (this.common.isActivatedEIP(6780)) {
                // copy over the items to result via iterator
                for (const item of createdAddresses) {
                    this._result.createdAddresses.add(item);
                }
            }
            // update stateRoot on current contract
            const account = await this._stateManager.getAccount(this._env.address);
            if (!account) {
                throw new Error('could not read contract account');
            }
            this._env.contract = account;
            this._runState.gasRefund = results.execResult.gasRefund ?? BIGINT_0;
        }
        return this._getReturnCode(results);
    }
    /**
     * Creates a new contract with a given value.
     */
    async create(gasLimit, value, codeToRun, salt, eofCallData) {
        const selfdestruct = new Set(this._result.selfdestruct);
        const caller = this._env.address;
        const depth = this._env.depth + 1;
        // empty the return data buffer
        this._runState.returnBytes = new Uint8Array(0);
        // Check if account has enough ether and max depth not exceeded
        if (this._env.depth >= Number(this.common.param('stackLimit')) ||
            this._env.contract.balance < value) {
            return BIGINT_0;
        }
        // EIP-2681 check
        if (this._env.contract.nonce >= MAX_UINT64) {
            return BIGINT_0;
        }
        this._env.contract.nonce += BIGINT_1;
        await this.journal.putAccount(this._env.address, this._env.contract);
        if (this.common.isActivatedEIP(3860)) {
            if (codeToRun.length > Number(this.common.param('maxInitCodeSize')) &&
                this._evm.allowUnlimitedInitCodeSize === false) {
                return BIGINT_0;
            }
        }
        const message = new Message({
            caller,
            gasLimit,
            value,
            data: codeToRun,
            eofCallData,
            salt,
            depth,
            selfdestruct,
            gasRefund: this._runState.gasRefund,
            blobVersionedHashes: this._env.blobVersionedHashes,
            accessWitness: this._env.accessWitness,
        });
        let createdAddresses;
        if (this.common.isActivatedEIP(6780)) {
            createdAddresses = new Set(this._result.createdAddresses);
            message.createdAddresses = createdAddresses;
        }
        const results = await this._evm.runCall({ message });
        if (results.execResult.logs) {
            this._result.logs = this._result.logs.concat(results.execResult.logs);
        }
        // this should always be safe
        this.useGas(results.execResult.executionGasUsed, 'CREATE');
        // Set return buffer in case revert happened
        if (results.execResult.exceptionError &&
            results.execResult.exceptionError.error === ERROR.REVERT) {
            this._runState.returnBytes = results.execResult.returnValue;
        }
        if (!results.execResult.exceptionError ||
            results.execResult.exceptionError.error === ERROR.CODESTORE_OUT_OF_GAS) {
            for (const addressToSelfdestructHex of selfdestruct) {
                this._result.selfdestruct.add(addressToSelfdestructHex);
            }
            if (this.common.isActivatedEIP(6780)) {
                // copy over the items to result via iterator
                for (const item of createdAddresses) {
                    this._result.createdAddresses.add(item);
                }
            }
            // update stateRoot on current contract
            const account = await this._stateManager.getAccount(this._env.address);
            if (!account) {
                throw new Error('could not read contract account');
            }
            this._env.contract = account;
            this._runState.gasRefund = results.execResult.gasRefund ?? BIGINT_0;
            if (results.createdAddress) {
                // push the created address to the stack
                return bytesToBigInt(results.createdAddress.bytes);
            }
        }
        return this._getReturnCode(results, true);
    }
    /**
     * Creates a new contract with a given value. Generates
     * a deterministic address via CREATE2 rules.
     */
    async create2(gasLimit, value, data, salt) {
        return this.create(gasLimit, value, data, salt);
    }
    /**
     * Creates a new contract with a given value. Generates
     * a deterministic address via EOFCREATE rules.
     */
    async eofcreate(gasLimit, value, containerData, salt, callData) {
        return this.create(gasLimit, value, containerData, salt, callData);
    }
    /**
     * Mark account for later deletion and give the remaining balance to the
     * specified beneficiary address. This will cause a trap and the
     * execution will be aborted immediately.
     * @param toAddress - Beneficiary address
     */
    async selfDestruct(toAddress) {
        return this._selfDestruct(toAddress);
    }
    async _selfDestruct(toAddress) {
        // only add to refund if this is the first selfdestruct for the address
        if (!this._result.selfdestruct.has(bytesToHex(this._env.address.bytes))) {
            this.refundGas(this.common.param('selfdestructRefundGas'));
        }
        this._result.selfdestruct.add(bytesToHex(this._env.address.bytes));
        const toSelf = equalsBytes(toAddress.bytes, this._env.address.bytes);
        // Add to beneficiary balance
        if (!toSelf) {
            let toAccount = await this._stateManager.getAccount(toAddress);
            if (!toAccount) {
                toAccount = new Account();
            }
            toAccount.balance += this._env.contract.balance;
            await this.journal.putAccount(toAddress, toAccount);
        }
        // Modify the account (set balance to 0) flag
        let doModify = !this.common.isActivatedEIP(6780); // Always do this if 6780 is not active
        if (!doModify) {
            // If 6780 is active, check if current address is being created. If so
            // old behavior of SELFDESTRUCT exists and balance should be set to 0 of this account
            // (i.e. burn the ETH in current account)
            doModify = this._env.createdAddresses.has(this._env.address.toString());
            // If contract is not being created in this tx...
            if (!doModify) {
                // Check if ETH being sent to another account (thus set balance to 0)
                doModify = !toSelf;
            }
        }
        // Set contract balance to 0
        if (doModify) {
            await this._stateManager.modifyAccountFields(this._env.address, {
                balance: BIGINT_0,
            });
        }
        trap(ERROR.STOP);
    }
    /**
     * Creates a new log in the current environment.
     */
    log(data, numberOfTopics, topics) {
        if (numberOfTopics < 0 || numberOfTopics > 4) {
            trap(ERROR.OUT_OF_RANGE);
        }
        if (topics.length !== numberOfTopics) {
            trap(ERROR.INTERNAL_ERROR);
        }
        const log = [this._env.address.bytes, topics, data];
        this._result.logs.push(log);
    }
    _getReturnCode(results, isEOFCreate = false) {
        if (this._runState.env.eof === undefined || isEOFCreate) {
            if (results.execResult.exceptionError) {
                return BIGINT_0;
            }
            else {
                return BIGINT_1;
            }
        }
        else {
            // EOF mode, call was either EXTCALL / EXTDELEGATECALL / EXTSTATICCALL
            if (results.execResult.exceptionError !== undefined) {
                if (results.execResult.exceptionError.error === ERROR.REVERT) {
                    // Revert
                    return BIGINT_1;
                }
                else {
                    // Failure
                    return BIGINT_2;
                }
            }
            return BIGINT_0;
        }
    }
}
//# sourceMappingURL=interpreter.js.map