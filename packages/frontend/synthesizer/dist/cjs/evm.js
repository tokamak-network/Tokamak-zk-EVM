"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultBlock = exports.EvmErrorResult = exports.CodesizeExceedsMaximumError = exports.INVALID_EOF_RESULT = exports.INVALID_BYTECODE_RESULT = exports.COOGResult = exports.OOGResult = exports.EVM = void 0;
const index_js_1 = require("@ethereumjs/common/dist/esm/index.js");
const index_js_2 = require("@ethereumjs/util/index.js");
const debug_1 = require("debug");
const eventemitter3_1 = require("eventemitter3");
const constants_js_1 = require("./eof/constants.js");
const util_js_1 = require("./eof/util.js");
const exceptions_js_1 = require("./exceptions.js");
const interpreter_js_1 = require("./interpreter.js");
const journal_js_1 = require("./journal.js");
const logger_js_1 = require("./logger.js");
const message_js_1 = require("./message.js");
const index_js_3 = require("./opcodes/index.js");
const params_js_1 = require("./params.js");
const index_js_4 = require("./precompiles/index.js");
const synthesizer_js_1 = require("./tokamak/core/synthesizer.js");
const transientStorage_js_1 = require("./transientStorage.js");
const types_js_1 = require("./types.js");
const debug = (0, debug_1.default)('evm:evm');
const debugGas = (0, debug_1.default)('evm:gas');
const debugPrecompiles = (0, debug_1.default)('evm:precompiles');
/**
 * EVM is responsible for executing an EVM message fully
 * (including any nested calls and creates), processing the results
 * and storing them to state (or discarding changes in case of exceptions).
 * @ignore
 */
class EVM {
    get precompiles() {
        return this._precompiles;
    }
    get opcodes() {
        return this._opcodes;
    }
    /**
     *
     * Creates new EVM object
     *
     * @deprecated The direct usage of this constructor is replaced since
     * non-finalized async initialization lead to side effects. Please
     * use the async {@link createEVM} constructor instead (same API).
     *
     * @param opts The EVM options
     * @param bn128 Initialized bn128 WASM object for precompile usage (internal)
     */
    constructor(opts) {
        /**
         * EVM is run in DEBUG mode (default: false)
         * Taken from DEBUG environment variable
         *
         * Safeguards on debug() calls are added for
         * performance reasons to avoid string literal evaluation
         * @hidden
         */
        this.DEBUG = false;
        this.common = opts.common;
        this.blockchain = opts.blockchain;
        this.stateManager = opts.stateManager;
        if (this.common.isActivatedEIP(6800)) {
            const mandatory = ['checkChunkWitnessPresent'];
            for (const m of mandatory) {
                if (!(m in this.stateManager)) {
                    throw new Error(`State manager used must implement ${m} if Verkle (EIP-6800) is activated`);
                }
            }
        }
        this.events = new eventemitter3_1.EventEmitter();
        this._optsCached = opts;
        // Supported EIPs
        const supportedEIPs = [
            663, 1153, 1559, 2537, 2565, 2718, 2929, 2930, 2935, 3198, 3529, 3540, 3541, 3607, 3651, 3670,
            3855, 3860, 4200, 4399, 4750, 4788, 4844, 4895, 5133, 5450, 5656, 6110, 6206, 6780, 6800,
            7002, 7069, 7251, 7480, 7516, 7620, 7685, 7692, 7698, 7702, 7709,
        ];
        for (const eip of this.common.eips()) {
            if (!supportedEIPs.includes(eip)) {
                throw new Error(`EIP-${eip} is not supported by the EVM`);
            }
        }
        if (!EVM.supportedHardforks.includes(this.common.hardfork())) {
            throw new Error(`Hardfork ${this.common.hardfork()} not set as supported in supportedHardforks`);
        }
        this.common.updateParams(opts.params ?? params_js_1.paramsEVM);
        this.allowUnlimitedContractSize = opts.allowUnlimitedContractSize ?? false;
        this.allowUnlimitedInitCodeSize = opts.allowUnlimitedInitCodeSize ?? false;
        this._customOpcodes = opts.customOpcodes;
        this._customPrecompiles = opts.customPrecompiles;
        this.journal = new journal_js_1.Journal(this.stateManager, this.common);
        this.transientStorage = new transientStorage_js_1.TransientStorage();
        this.common.events.on('hardforkChanged', () => {
            this.getActiveOpcodes();
            this._precompiles = (0, index_js_4.getActivePrecompiles)(this.common, this._customPrecompiles);
        });
        // Initialize the opcode data
        this.getActiveOpcodes();
        this._precompiles = (0, index_js_4.getActivePrecompiles)(this.common, this._customPrecompiles);
        // Precompile crypto libraries
        if (this.common.isActivatedEIP(2537)) {
            this._bls = opts.bls ?? new index_js_4.NobleBLS();
            this._bls.init?.();
        }
        this._bn254 = opts.bn254;
        this._emit = async (topic, data) => {
            const listeners = this.events.listeners(topic);
            for (const listener of listeners) {
                if (listener.length === 2) {
                    await new Promise((resolve) => {
                        listener(data, resolve);
                    });
                }
                else {
                    listener(data);
                }
            }
        };
        this.performanceLogger = new logger_js_1.EVMPerformanceLogger();
        // Skip DEBUG calls unless 'ethjs' included in environmental DEBUG variables
        // Additional window check is to prevent vite browser bundling (and potentially other) to break
        this.DEBUG =
            typeof window === 'undefined' ? (process?.env?.DEBUG?.includes('ethjs') ?? false) : false;
        this.synthesizer = new synthesizer_js_1.Synthesizer();
    }
    /**
     * Returns a list with the currently activated opcodes
     * available for EVM execution
     */
    getActiveOpcodes() {
        const data = (0, index_js_3.getOpcodesForHF)(this.common, this._customOpcodes);
        this._opcodes = data.opcodes;
        this._dynamicGasHandlers = data.dynamicGasHandlers;
        this._handlers = data.handlers;
        this._opcodeMap = data.opcodeMap;
        return data.opcodes;
    }
    async _executeCall(message) {
        let gasLimit = message.gasLimit;
        const fromAddress = message.caller;
        if (this.common.isActivatedEIP(6800)) {
            const sendsValue = message.value !== index_js_2.BIGINT_0;
            if (message.depth === 0) {
                const originAccessGas = message.accessWitness.touchTxOriginAndComputeGas(fromAddress);
                debugGas(`originAccessGas=${originAccessGas} waived off for origin at depth=0`);
                const destAccessGas = message.accessWitness.touchTxTargetAndComputeGas(message.to, {
                    sendsValue,
                });
                debugGas(`destAccessGas=${destAccessGas} waived off for target at depth=0`);
            }
            let callAccessGas = message.accessWitness.touchAndChargeMessageCall(message.to);
            if (sendsValue) {
                callAccessGas += message.accessWitness.touchAndChargeValueTransfer(message.to);
            }
            gasLimit -= callAccessGas;
            if (gasLimit < index_js_2.BIGINT_0) {
                if (this.DEBUG) {
                    debugGas(`callAccessGas charged(${callAccessGas}) caused OOG (-> ${gasLimit})`);
                }
                return { execResult: OOGResult(message.gasLimit) };
            }
            else {
                if (this.DEBUG) {
                    debugGas(`callAccessGas used (${callAccessGas} gas (-> ${gasLimit}))`);
                }
            }
        }
        let account = await this.stateManager.getAccount(fromAddress);
        if (!account) {
            account = new index_js_2.Account();
        }
        let errorMessage;
        // Reduce tx value from sender
        if (!message.delegatecall) {
            try {
                await this._reduceSenderBalance(account, message);
            }
            catch (e) {
                errorMessage = e;
            }
        }
        // Load `to` account
        let toAccount = await this.stateManager.getAccount(message.to);
        if (!toAccount) {
            if (this.common.isActivatedEIP(6800)) {
                const absenceProofAccessGas = message.accessWitness.touchAndChargeProofOfAbsence(message.to);
                gasLimit -= absenceProofAccessGas;
                if (gasLimit < index_js_2.BIGINT_0) {
                    if (this.DEBUG) {
                        debugGas(`Proof of absence access charged(${absenceProofAccessGas}) caused OOG (-> ${gasLimit})`);
                    }
                    return { execResult: OOGResult(message.gasLimit) };
                }
                else {
                    if (this.DEBUG) {
                        debugGas(`Proof of absence access used (${absenceProofAccessGas} gas (-> ${gasLimit}))`);
                    }
                }
            }
            toAccount = new index_js_2.Account();
        }
        // Add tx value to the `to` account
        if (!message.delegatecall) {
            try {
                await this._addToBalance(toAccount, message);
            }
            catch (e) {
                errorMessage = e;
            }
        }
        // Load code
        await this._loadCode(message);
        let exit = false;
        if (!message.code || (typeof message.code !== 'function' && message.code.length === 0)) {
            exit = true;
            if (this.DEBUG) {
                debug(`Exit early on no code (CALL)`);
            }
        }
        if (errorMessage !== undefined) {
            exit = true;
            if (this.DEBUG) {
                debug(`Exit early on value transfer overflowed (CALL)`);
            }
        }
        if (exit) {
            return {
                execResult: {
                    gasRefund: message.gasRefund,
                    executionGasUsed: message.gasLimit - gasLimit,
                    exceptionError: errorMessage,
                    returnValue: new Uint8Array(0),
                    returnMemoryPts: [],
                },
            };
        }
        let result;
        if (message.isCompiled) {
            let timer;
            let callTimer;
            let target;
            if (this._optsCached.profiler?.enabled === true) {
                target = (0, index_js_2.bytesToUnprefixedHex)(message.codeAddress.bytes);
                // TODO: map target precompile not to address, but to a name
                target = (0, index_js_4.getPrecompileName)(target) ?? target.slice(20);
                if (this.performanceLogger.hasTimer()) {
                    callTimer = this.performanceLogger.pauseTimer();
                }
                timer = this.performanceLogger.startTimer(target);
            }
            result = await this.runPrecompile(message.code, message.data, gasLimit);
            if (this._optsCached.profiler?.enabled === true) {
                this.performanceLogger.stopTimer(timer, Number(result.executionGasUsed), 'precompiles');
                if (callTimer !== undefined) {
                    this.performanceLogger.unpauseTimer(callTimer);
                }
            }
            result.gasRefund = message.gasRefund;
        }
        else {
            if (this.DEBUG) {
                debug(`Start bytecode processing...`);
            }
            result = await this.runInterpreter({ ...message, gasLimit });
        }
        if (message.depth === 0) {
            this.postMessageCleanup();
        }
        result.executionGasUsed += message.gasLimit - gasLimit;
        return {
            execResult: result,
        };
    }
    async _executeCreate(message) {
        let gasLimit = message.gasLimit;
        const fromAddress = message.caller;
        if (this.common.isActivatedEIP(6800)) {
            if (message.depth === 0) {
                const originAccessGas = message.accessWitness.touchTxOriginAndComputeGas(fromAddress);
                debugGas(`originAccessGas=${originAccessGas} waived off for origin at depth=0`);
            }
        }
        let account = await this.stateManager.getAccount(message.caller);
        if (!account) {
            account = new index_js_2.Account();
        }
        // Reduce tx value from sender
        await this._reduceSenderBalance(account, message);
        if (this.common.isActivatedEIP(3860)) {
            if (message.data.length > Number(this.common.param('maxInitCodeSize')) &&
                !this.allowUnlimitedInitCodeSize) {
                return {
                    createdAddress: message.to,
                    execResult: {
                        returnValue: new Uint8Array(0),
                        exceptionError: new exceptions_js_1.EvmError(exceptions_js_1.ERROR.INITCODE_SIZE_VIOLATION),
                        executionGasUsed: message.gasLimit,
                        returnMemoryPts: [],
                    },
                };
            }
        }
        // TODO at some point, figure out why we swapped out data to code in the first place
        message.code = message.data;
        message.data = message.eofCallData ?? new Uint8Array();
        message.to = await this._generateAddress(message);
        if (this.common.isActivatedEIP(6780)) {
            message.createdAddresses.add(message.to.toString());
        }
        if (this.DEBUG) {
            debug(`Generated CREATE contract address ${message.to}`);
        }
        let toAccount = await this.stateManager.getAccount(message.to);
        if (!toAccount) {
            toAccount = new index_js_2.Account();
        }
        if (this.common.isActivatedEIP(6800)) {
            const contractCreateAccessGas = message.accessWitness.touchAndChargeContractCreateInit(message.to);
            gasLimit -= contractCreateAccessGas;
            if (gasLimit < index_js_2.BIGINT_0) {
                if (this.DEBUG) {
                    debugGas(`ContractCreateInit charge(${contractCreateAccessGas}) caused OOG (-> ${gasLimit})`);
                }
                return { execResult: OOGResult(message.gasLimit) };
            }
            else {
                if (this.DEBUG) {
                    debugGas(`ContractCreateInit charged (${contractCreateAccessGas} gas (-> ${gasLimit}))`);
                }
            }
        }
        // Check for collision
        if ((toAccount.nonce && toAccount.nonce > index_js_2.BIGINT_0) ||
            !((0, index_js_2.equalsBytes)(toAccount.codeHash, index_js_2.KECCAK256_NULL) === true) ||
            // See EIP 7610 and the discussion `https://ethereum-magicians.org/t/eip-7610-revert-creation-in-case-of-non-empty-storage`
            !((0, index_js_2.equalsBytes)(toAccount.storageRoot, index_js_2.KECCAK256_RLP) === true)) {
            if (this.DEBUG) {
                debug(`Returning on address collision`);
            }
            return {
                createdAddress: message.to,
                execResult: {
                    returnValue: new Uint8Array(0),
                    exceptionError: new exceptions_js_1.EvmError(exceptions_js_1.ERROR.CREATE_COLLISION),
                    executionGasUsed: message.gasLimit,
                    returnMemoryPts: [],
                },
            };
        }
        await this.journal.putAccount(message.to, toAccount);
        await this.stateManager.clearStorage(message.to);
        const newContractEvent = {
            address: message.to,
            code: message.code,
        };
        await this._emit('newContract', newContractEvent);
        toAccount = await this.stateManager.getAccount(message.to);
        if (!toAccount) {
            toAccount = new index_js_2.Account();
        }
        // EIP-161 on account creation and CREATE execution
        if (this.common.gteHardfork(index_js_1.Hardfork.SpuriousDragon)) {
            toAccount.nonce += index_js_2.BIGINT_1;
        }
        // Add tx value to the `to` account
        let errorMessage;
        try {
            await this._addToBalance(toAccount, message);
        }
        catch (e) {
            errorMessage = e;
        }
        let exit = false;
        if (message.code === undefined ||
            (typeof message.code !== 'function' && message.code.length === 0)) {
            exit = true;
            if (this.DEBUG) {
                debug(`Exit early on no code (CREATE)`);
            }
        }
        if (errorMessage !== undefined) {
            exit = true;
            if (this.DEBUG) {
                debug(`Exit early on value transfer overflowed (CREATE)`);
            }
        }
        if (exit) {
            if (this.common.isActivatedEIP(6800)) {
                const createCompleteAccessGas = message.accessWitness.touchAndChargeContractCreateCompleted(message.to);
                gasLimit -= createCompleteAccessGas;
                if (gasLimit < index_js_2.BIGINT_0) {
                    if (this.DEBUG) {
                        debug(`ContractCreateComplete access gas (${createCompleteAccessGas}) caused OOG (-> ${gasLimit})`);
                    }
                    return { execResult: OOGResult(message.gasLimit) };
                }
                else {
                    debug(`ContractCreateComplete access used (${createCompleteAccessGas}) gas (-> ${gasLimit})`);
                }
            }
            return {
                createdAddress: message.to,
                execResult: {
                    executionGasUsed: message.gasLimit - gasLimit,
                    gasRefund: message.gasRefund,
                    exceptionError: errorMessage,
                    returnValue: new Uint8Array(0),
                    returnMemoryPts: [],
                },
            };
        }
        if (this.DEBUG) {
            debug(`Start bytecode processing...`);
        }
        // run the message with the updated gas limit and add accessed gas used to the result
        let result = await this.runInterpreter({ ...message, gasLimit, isCreate: true });
        result.executionGasUsed += message.gasLimit - gasLimit;
        // fee for size of the return value
        let totalGas = result.executionGasUsed;
        let returnFee = index_js_2.BIGINT_0;
        if (!result.exceptionError && !this.common.isActivatedEIP(6800)) {
            returnFee = BigInt(result.returnValue.length) * BigInt(this.common.param('createDataGas'));
            totalGas = totalGas + returnFee;
            if (this.DEBUG) {
                debugGas(`Add return value size fee (${returnFee} to gas used (-> ${totalGas}))`);
            }
        }
        // Check for SpuriousDragon EIP-170 code size limit
        let allowedCodeSize = true;
        if (!result.exceptionError &&
            this.common.gteHardfork(index_js_1.Hardfork.SpuriousDragon) &&
            result.returnValue.length > Number(this.common.param('maxCodeSize'))) {
            allowedCodeSize = false;
        }
        // If enough gas and allowed code size
        let CodestoreOOG = false;
        if (totalGas <= message.gasLimit && (this.allowUnlimitedContractSize || allowedCodeSize)) {
            if (this.common.isActivatedEIP(3541) && result.returnValue[0] === constants_js_1.FORMAT) {
                if (!this.common.isActivatedEIP(3540)) {
                    result = { ...result, ...INVALID_BYTECODE_RESULT(message.gasLimit) };
                }
                else if (
                // TODO check if this is correct
                // Also likely cleanup this eofCallData stuff
                /*(message.depth > 0 && message.eofCallData === undefined) ||
                (message.depth === 0 && !isEOF(message.code))*/
                !(0, util_js_1.isEOF)(message.code)) {
                    // TODO the message.eof was flagged for this to work for this first
                    // Running into Legacy mode: unable to deploy EOF contract
                    result = { ...result, ...INVALID_BYTECODE_RESULT(message.gasLimit) };
                }
                else {
                    // 3541 is active and current runtime mode is EOF
                    result.executionGasUsed = totalGas;
                }
            }
            else {
                result.executionGasUsed = totalGas;
            }
        }
        else {
            if (this.common.gteHardfork(index_js_1.Hardfork.Homestead)) {
                if (!allowedCodeSize) {
                    if (this.DEBUG) {
                        debug(`Code size exceeds maximum code size (>= SpuriousDragon)`);
                    }
                    result = { ...result, ...CodesizeExceedsMaximumError(message.gasLimit) };
                }
                else {
                    if (this.DEBUG) {
                        debug(`Contract creation: out of gas`);
                    }
                    result = { ...result, ...OOGResult(message.gasLimit) };
                }
            }
            else {
                // we are in Frontier
                if (totalGas - returnFee <= message.gasLimit) {
                    // we cannot pay the code deposit fee (but the deposit code actually did run)
                    if (this.DEBUG) {
                        debug(`Not enough gas to pay the code deposit fee (Frontier)`);
                    }
                    result = { ...result, ...COOGResult(totalGas - returnFee) };
                    CodestoreOOG = true;
                }
                else {
                    if (this.DEBUG) {
                        debug(`Contract creation: out of gas`);
                    }
                    result = { ...result, ...OOGResult(message.gasLimit) };
                }
            }
        }
        // get the fresh gas limit for the rest of the ops
        gasLimit = message.gasLimit - result.executionGasUsed;
        if (!result.exceptionError && this.common.isActivatedEIP(6800)) {
            const createCompleteAccessGas = message.accessWitness.touchAndChargeContractCreateCompleted(message.to);
            gasLimit -= createCompleteAccessGas;
            if (gasLimit < index_js_2.BIGINT_0) {
                if (this.DEBUG) {
                    debug(`ContractCreateComplete access gas (${createCompleteAccessGas}) caused OOG (-> ${gasLimit})`);
                }
                result = { ...result, ...OOGResult(message.gasLimit) };
            }
            else {
                debug(`ContractCreateComplete access used (${createCompleteAccessGas}) gas (-> ${gasLimit})`);
                result.executionGasUsed += createCompleteAccessGas;
            }
        }
        // Save code if a new contract was created
        if (!result.exceptionError &&
            result.returnValue !== undefined &&
            result.returnValue.length !== 0) {
            // Add access charges for writing this code to the state
            if (this.common.isActivatedEIP(6800)) {
                const byteCodeWriteAccessfee = message.accessWitness.touchCodeChunksRangeOnWriteAndChargeGas(message.to, 0, result.returnValue.length - 1);
                gasLimit -= byteCodeWriteAccessfee;
                if (gasLimit < index_js_2.BIGINT_0) {
                    if (this.DEBUG) {
                        debug(`byteCodeWrite access gas (${byteCodeWriteAccessfee}) caused OOG (-> ${gasLimit})`);
                    }
                    result = { ...result, ...OOGResult(message.gasLimit) };
                }
                else {
                    debug(`byteCodeWrite access used (${byteCodeWriteAccessfee}) gas (-> ${gasLimit})`);
                    result.executionGasUsed += byteCodeWriteAccessfee;
                }
            }
            await this.stateManager.putCode(message.to, result.returnValue);
            if (this.DEBUG) {
                debug(`Code saved on new contract creation`);
            }
        }
        else if (CodestoreOOG) {
            // This only happens at Frontier. But, let's do a sanity check;
            if (!this.common.gteHardfork(index_js_1.Hardfork.Homestead)) {
                // Pre-Homestead behavior; put an empty contract.
                // This contract would be considered "DEAD" in later hard forks.
                // It is thus an unnecessary default item, which we have to save to disk
                // It does change the state root, but it only wastes storage.
                const account = await this.stateManager.getAccount(message.to);
                await this.journal.putAccount(message.to, account ?? new index_js_2.Account());
            }
        }
        if (message.depth === 0) {
            this.postMessageCleanup();
        }
        return {
            createdAddress: message.to,
            execResult: result,
        };
    }
    /**
     * Starts the actual bytecode processing for a CALL or CREATE
     */
    async runInterpreter(message, opts = {}) {
        let contract = await this.stateManager.getAccount(message.to ?? (0, index_js_2.createZeroAddress)());
        if (!contract) {
            contract = new index_js_2.Account();
        }
        const env = {
            address: message.to ?? (0, index_js_2.createZeroAddress)(),
            caller: message.caller ?? (0, index_js_2.createZeroAddress)(),
            callData: message.data ?? Uint8Array.from([0]),
            callValue: message.value ?? index_js_2.BIGINT_0,
            code: message.code,
            isStatic: message.isStatic ?? false,
            isCreate: message.isCreate ?? false,
            depth: message.depth ?? 0,
            gasPrice: this._tx.gasPrice,
            origin: this._tx.origin ?? message.caller ?? (0, index_js_2.createZeroAddress)(),
            block: this._block ?? defaultBlock(),
            contract,
            codeAddress: message.codeAddress,
            gasRefund: message.gasRefund,
            chargeCodeAccesses: message.chargeCodeAccesses,
            blobVersionedHashes: message.blobVersionedHashes ?? [],
            accessWitness: message.accessWitness,
            createdAddresses: message.createdAddresses,
            callMemoryPts: message.memoryPts ?? [],
        };
        const interpreter = new interpreter_js_1.Interpreter(this, this.stateManager, this.blockchain, env, message.gasLimit, this.journal, this.performanceLogger, this.synthesizer, this._optsCached.profiler);
        if (message.selfdestruct) {
            interpreter._result.selfdestruct = message.selfdestruct;
        }
        if (message.createdAddresses) {
            interpreter._result.createdAddresses = message.createdAddresses;
        }
        const interpreterRes = await interpreter.run(message.code, opts);
        let result = interpreter._result;
        let gasUsed = message.gasLimit - interpreterRes.runState.gasLeft;
        if (interpreterRes.exceptionError) {
            if (interpreterRes.exceptionError.error !== exceptions_js_1.ERROR.REVERT &&
                interpreterRes.exceptionError.error !== exceptions_js_1.ERROR.INVALID_EOF_FORMAT) {
                gasUsed = message.gasLimit;
            }
            // Clear the result on error
            result = {
                ...result,
                logs: [],
                selfdestruct: new Set(),
                createdAddresses: new Set(),
            };
        }
        return {
            ...result,
            runState: {
                ...interpreterRes.runState,
                ...result,
                ...interpreter._env,
            },
            exceptionError: interpreterRes.exceptionError,
            gas: interpreterRes.runState?.gasLeft,
            executionGasUsed: gasUsed,
            gasRefund: interpreterRes.runState.gasRefund,
            returnValue: result.returnValue ? result.returnValue : new Uint8Array(0),
            returnMemoryPts: result.returnMemoryPts ? result.returnMemoryPts : [],
        };
    }
    /**
     * Executes an EVM message, determining whether it's a call or create
     * based on the `to` address. It checkpoints the state and reverts changes
     * if an exception happens during the message execution.
     */
    async runCall(opts) {
        let timer;
        if ((opts.depth === 0 || opts.message === undefined) &&
            this._optsCached.profiler?.enabled === true) {
            timer = this.performanceLogger.startTimer('Initialization');
        }
        let message = opts.message;
        let callerAccount;
        if (!message) {
            this._block = opts.block ?? defaultBlock();
            this._tx = {
                gasPrice: opts.gasPrice ?? index_js_2.BIGINT_0,
                origin: opts.origin ?? opts.caller ?? (0, index_js_2.createZeroAddress)(),
            };
            const caller = opts.caller ?? (0, index_js_2.createZeroAddress)();
            const value = opts.value ?? index_js_2.BIGINT_0;
            if (opts.skipBalance === true) {
                callerAccount = await this.stateManager.getAccount(caller);
                if (!callerAccount) {
                    callerAccount = new index_js_2.Account();
                }
                if (callerAccount.balance < value) {
                    // if skipBalance and balance less than value, set caller balance to `value` to ensure sufficient funds
                    callerAccount.balance = value;
                    await this.journal.putAccount(caller, callerAccount);
                }
            }
            message = new message_js_1.Message({
                caller,
                gasLimit: opts.gasLimit ?? BigInt(0xffffff),
                to: opts.to,
                value,
                data: opts.data,
                code: opts.code,
                depth: opts.depth,
                isCompiled: opts.isCompiled,
                isStatic: opts.isStatic,
                salt: opts.salt,
                selfdestruct: opts.selfdestruct ?? new Set(),
                createdAddresses: opts.createdAddresses ?? new Set(),
                delegatecall: opts.delegatecall,
                blobVersionedHashes: opts.blobVersionedHashes,
                accessWitness: opts.accessWitness,
            });
        }
        if (message.depth === 0) {
            if (!callerAccount) {
                callerAccount = await this.stateManager.getAccount(message.caller);
            }
            if (!callerAccount) {
                callerAccount = new index_js_2.Account();
            }
            callerAccount.nonce++;
            await this.journal.putAccount(message.caller, callerAccount);
            if (this.DEBUG) {
                debug(`Update fromAccount (caller) nonce (-> ${callerAccount.nonce}))`);
            }
        }
        await this._emit('beforeMessage', message);
        if (!message.to && this.common.isActivatedEIP(2929)) {
            message.code = message.data;
            this.journal.addWarmedAddress((await this._generateAddress(message)).bytes);
        }
        await this.journal.checkpoint();
        if (this.common.isActivatedEIP(1153))
            this.transientStorage.checkpoint();
        if (this.DEBUG) {
            debug('-'.repeat(100));
            debug(`message checkpoint`);
        }
        let result;
        if (this.DEBUG) {
            const { caller, gasLimit, to, value, delegatecall } = message;
            debug(`New message caller=${caller} gasLimit=${gasLimit} to=${to?.toString() ?? 'none'} value=${value} delegatecall=${delegatecall ? 'yes' : 'no'}`);
        }
        if (message.to) {
            if (this.DEBUG) {
                debug(`Message CALL execution (to: ${message.to})`);
            }
            result = await this._executeCall(message);
        }
        else {
            if (this.DEBUG) {
                debug(`Message CREATE execution (to undefined)`);
            }
            result = await this._executeCreate(message);
        }
        if (this.DEBUG) {
            const { executionGasUsed, exceptionError, returnValue } = result.execResult;
            debug(`Received message execResult: [ gasUsed=${executionGasUsed} exceptionError=${exceptionError ? `'${exceptionError.error}'` : 'none'} returnValue=${(0, index_js_2.short)(returnValue)} gasRefund=${result.execResult.gasRefund ?? 0} ]`);
        }
        const err = result.execResult.exceptionError;
        // This clause captures any error which happened during execution
        // If that is the case, then all refunds are forfeited
        // There is one exception: if the CODESTORE_OUT_OF_GAS error is thrown
        // (this only happens the Frontier/Chainstart fork)
        // then the error is dismissed
        if (err && err.error !== exceptions_js_1.ERROR.CODESTORE_OUT_OF_GAS) {
            result.execResult.selfdestruct = new Set();
            result.execResult.createdAddresses = new Set();
            result.execResult.gasRefund = index_js_2.BIGINT_0;
        }
        if (err &&
            !(this.common.hardfork() === index_js_1.Hardfork.Chainstart && err.error === exceptions_js_1.ERROR.CODESTORE_OUT_OF_GAS)) {
            result.execResult.logs = [];
            await this.journal.revert();
            if (this.common.isActivatedEIP(1153))
                this.transientStorage.revert();
            if (this.DEBUG) {
                debug(`message checkpoint reverted`);
            }
        }
        else {
            await this.journal.commit();
            if (this.common.isActivatedEIP(1153))
                this.transientStorage.commit();
            if (this.DEBUG) {
                debug(`message checkpoint committed`);
            }
        }
        await this._emit('afterMessage', result);
        if (message.depth === 0 && this._optsCached.profiler?.enabled === true) {
            this.performanceLogger.stopTimer(timer, 0);
        }
        return result;
    }
    /**
     * Bound to the global VM and therefore
     * shouldn't be used directly from the evm class
     */
    async runCode(opts) {
        this._block = opts.block ?? defaultBlock();
        this._tx = {
            gasPrice: opts.gasPrice ?? index_js_2.BIGINT_0,
            origin: opts.origin ?? opts.caller ?? (0, index_js_2.createZeroAddress)(),
        };
        const message = new message_js_1.Message({
            code: opts.code,
            data: opts.data,
            gasLimit: opts.gasLimit ?? BigInt(0xffffff),
            to: opts.to ?? (0, index_js_2.createZeroAddress)(),
            caller: opts.caller,
            value: opts.value,
            depth: opts.depth,
            selfdestruct: opts.selfdestruct ?? new Set(),
            isStatic: opts.isStatic,
            blobVersionedHashes: opts.blobVersionedHashes,
        });
        return this.runInterpreter(message, { pc: opts.pc });
    }
    /**
     * Returns code for precompile at the given address, or undefined
     * if no such precompile exists.
     */
    getPrecompile(address) {
        return this.precompiles.get((0, index_js_2.bytesToUnprefixedHex)(address.bytes));
    }
    /**
     * Executes a precompiled contract with given data and gas limit.
     */
    runPrecompile(code, data, gasLimit) {
        if (typeof code !== 'function') {
            throw new Error('Invalid precompile');
        }
        const opts = {
            data,
            gasLimit,
            common: this.common,
            _EVM: this,
            _debug: this.DEBUG ? debugPrecompiles : undefined,
            stateManager: this.stateManager,
        };
        return code(opts);
    }
    async _loadCode(message) {
        if (!message.code) {
            const precompile = this.getPrecompile(message.codeAddress);
            if (precompile) {
                message.code = precompile;
                message.isCompiled = true;
            }
            else {
                message.code = await this.stateManager.getCode(message.codeAddress);
                // EIP-7702 delegation check
                if (this.common.isActivatedEIP(7702) &&
                    (0, index_js_2.equalsBytes)(message.code.slice(0, 3), types_js_1.DELEGATION_7702_FLAG)) {
                    const address = new index_js_2.Address(message.code.slice(3, 24));
                    message.code = await this.stateManager.getCode(address);
                    if (message.depth === 0) {
                        this.journal.addAlwaysWarmAddress(address.toString());
                    }
                }
                message.isCompiled = false;
                message.chargeCodeAccesses = true;
            }
        }
    }
    async _generateAddress(message) {
        let addr;
        if (message.salt) {
            addr = (0, index_js_2.generateAddress2)(message.caller.bytes, message.salt, message.code);
        }
        else {
            let acc = await this.stateManager.getAccount(message.caller);
            if (!acc) {
                acc = new index_js_2.Account();
            }
            const newNonce = acc.nonce - index_js_2.BIGINT_1;
            addr = (0, index_js_2.generateAddress)(message.caller.bytes, (0, index_js_2.bigIntToBytes)(newNonce));
        }
        return new index_js_2.Address(addr);
    }
    async _reduceSenderBalance(account, message) {
        account.balance -= message.value;
        if (account.balance < index_js_2.BIGINT_0) {
            throw new exceptions_js_1.EvmError(exceptions_js_1.ERROR.INSUFFICIENT_BALANCE);
        }
        const result = this.journal.putAccount(message.caller, account);
        if (this.DEBUG) {
            debug(`Reduced sender (${message.caller}) balance (-> ${account.balance})`);
        }
        return result;
    }
    async _addToBalance(toAccount, message) {
        const newBalance = toAccount.balance + message.value;
        if (newBalance > index_js_2.MAX_INTEGER) {
            throw new exceptions_js_1.EvmError(exceptions_js_1.ERROR.VALUE_OVERFLOW);
        }
        toAccount.balance = newBalance;
        // putAccount as the nonce may have changed for contract creation
        const result = this.journal.putAccount(message.to, toAccount);
        if (this.DEBUG) {
            debug(`Added toAccount (${message.to}) balance (-> ${toAccount.balance})`);
        }
        return result;
    }
    /**
     * Once the interpreter has finished depth 0, a post-message cleanup should be done
     */
    postMessageCleanup() {
        if (this.common.isActivatedEIP(1153))
            this.transientStorage.clear();
    }
    /**
     * This method copies the EVM, current HF and EIP settings
     * and returns a new EVM instance.
     *
     * Note: this is only a shallow copy and both EVM instances
     * will point to the same underlying state DB.
     *
     * @returns EVM
     */
    shallowCopy() {
        const common = this.common.copy();
        common.setHardfork(this.common.hardfork());
        const opts = {
            ...this._optsCached,
            common,
            stateManager: this.stateManager.shallowCopy(),
        };
        opts.stateManager.common = common;
        return new EVM(opts);
    }
    getPerformanceLogs() {
        return this.performanceLogger.getLogs();
    }
    clearPerformanceLogs() {
        this.performanceLogger.clear();
    }
}
exports.EVM = EVM;
EVM.supportedHardforks = [
    index_js_1.Hardfork.Chainstart,
    index_js_1.Hardfork.Homestead,
    index_js_1.Hardfork.Dao,
    index_js_1.Hardfork.TangerineWhistle,
    index_js_1.Hardfork.SpuriousDragon,
    index_js_1.Hardfork.Byzantium,
    index_js_1.Hardfork.Constantinople,
    index_js_1.Hardfork.Petersburg,
    index_js_1.Hardfork.Istanbul,
    index_js_1.Hardfork.MuirGlacier,
    index_js_1.Hardfork.Berlin,
    index_js_1.Hardfork.London,
    index_js_1.Hardfork.ArrowGlacier,
    index_js_1.Hardfork.GrayGlacier,
    index_js_1.Hardfork.MergeForkIdTransition,
    index_js_1.Hardfork.Paris,
    index_js_1.Hardfork.Shanghai,
    index_js_1.Hardfork.Cancun,
    index_js_1.Hardfork.Prague,
    index_js_1.Hardfork.Osaka,
];
function OOGResult(gasLimit) {
    return {
        returnValue: new Uint8Array(0),
        executionGasUsed: gasLimit,
        exceptionError: new exceptions_js_1.EvmError(exceptions_js_1.ERROR.OUT_OF_GAS),
        returnMemoryPts: [],
    };
}
exports.OOGResult = OOGResult;
// CodeDeposit OOG Result
function COOGResult(gasUsedCreateCode) {
    return {
        returnValue: new Uint8Array(0),
        executionGasUsed: gasUsedCreateCode,
        exceptionError: new exceptions_js_1.EvmError(exceptions_js_1.ERROR.CODESTORE_OUT_OF_GAS),
        returnMemoryPts: [],
    };
}
exports.COOGResult = COOGResult;
function INVALID_BYTECODE_RESULT(gasLimit) {
    return {
        returnValue: new Uint8Array(0),
        executionGasUsed: gasLimit,
        exceptionError: new exceptions_js_1.EvmError(exceptions_js_1.ERROR.INVALID_BYTECODE_RESULT),
        returnMemoryPts: [],
    };
}
exports.INVALID_BYTECODE_RESULT = INVALID_BYTECODE_RESULT;
function INVALID_EOF_RESULT(gasLimit) {
    return {
        returnValue: new Uint8Array(0),
        executionGasUsed: gasLimit,
        exceptionError: new exceptions_js_1.EvmError(exceptions_js_1.ERROR.INVALID_EOF_FORMAT),
        returnMemoryPts: [],
    };
}
exports.INVALID_EOF_RESULT = INVALID_EOF_RESULT;
function CodesizeExceedsMaximumError(gasUsed) {
    return {
        returnValue: new Uint8Array(0),
        executionGasUsed: gasUsed,
        exceptionError: new exceptions_js_1.EvmError(exceptions_js_1.ERROR.CODESIZE_EXCEEDS_MAXIMUM),
        returnMemoryPts: [],
    };
}
exports.CodesizeExceedsMaximumError = CodesizeExceedsMaximumError;
function EvmErrorResult(error, gasUsed) {
    return {
        returnValue: new Uint8Array(0),
        executionGasUsed: gasUsed,
        exceptionError: error,
        returnMemoryPts: [],
    };
}
exports.EvmErrorResult = EvmErrorResult;
function defaultBlock() {
    return {
        header: {
            number: index_js_2.BIGINT_0,
            coinbase: (0, index_js_2.createZeroAddress)(),
            timestamp: index_js_2.BIGINT_0,
            difficulty: index_js_2.BIGINT_0,
            prevRandao: new Uint8Array(32),
            gasLimit: index_js_2.BIGINT_0,
            baseFeePerGas: undefined,
            getBlobGasPrice: () => undefined,
        },
    };
}
exports.defaultBlock = defaultBlock;
//# sourceMappingURL=evm.js.map