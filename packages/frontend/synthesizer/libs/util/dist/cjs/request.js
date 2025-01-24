"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLRequestFactory = exports.createConsolidationRequestFromRLP = exports.createConsolidationRequestFromJSON = exports.createConsolidationRequest = exports.createWithdrawalRequestFromRLP = exports.createWithdrawalRequestFromJSON = exports.createWithdrawalRequest = exports.createDepositRequestFromRLP = exports.createDepositRequestFromJSON = exports.createDepositRequest = exports.ConsolidationRequest = exports.WithdrawalRequest = exports.DepositRequest = exports.CLRequest = exports.CLRequestType = void 0;
const rlp_1 = require("@ethereumjs/rlp");
const utils_1 = require("ethereum-cryptography/utils");
const bytes_js_1 = require("./bytes.js");
const constants_js_1 = require("./constants.js");
var CLRequestType;
(function (CLRequestType) {
    CLRequestType[CLRequestType["Deposit"] = 0] = "Deposit";
    CLRequestType[CLRequestType["Withdrawal"] = 1] = "Withdrawal";
    CLRequestType[CLRequestType["Consolidation"] = 2] = "Consolidation";
})(CLRequestType = exports.CLRequestType || (exports.CLRequestType = {}));
class CLRequest {
    constructor(type) {
        this.type = type;
    }
}
exports.CLRequest = CLRequest;
class DepositRequest extends CLRequest {
    constructor(pubkey, withdrawalCredentials, amount, signature, index) {
        super(CLRequestType.Deposit);
        this.pubkey = pubkey;
        this.withdrawalCredentials = withdrawalCredentials;
        this.amount = amount;
        this.signature = signature;
        this.index = index;
    }
    serialize() {
        const indexBytes = this.index === constants_js_1.BIGINT_0 ? new Uint8Array() : (0, bytes_js_1.bigIntToBytes)(this.index);
        const amountBytes = this.amount === constants_js_1.BIGINT_0 ? new Uint8Array() : (0, bytes_js_1.bigIntToBytes)(this.amount);
        return (0, utils_1.concatBytes)(Uint8Array.from([this.type]), rlp_1.RLP.encode([
            this.pubkey,
            this.withdrawalCredentials,
            amountBytes,
            this.signature,
            indexBytes,
        ]));
    }
    toJSON() {
        return {
            pubkey: (0, bytes_js_1.bytesToHex)(this.pubkey),
            withdrawalCredentials: (0, bytes_js_1.bytesToHex)(this.withdrawalCredentials),
            amount: (0, bytes_js_1.bigIntToHex)(this.amount),
            signature: (0, bytes_js_1.bytesToHex)(this.signature),
            index: (0, bytes_js_1.bigIntToHex)(this.index),
        };
    }
}
exports.DepositRequest = DepositRequest;
class WithdrawalRequest extends CLRequest {
    constructor(sourceAddress, validatorPubkey, amount) {
        super(CLRequestType.Withdrawal);
        this.sourceAddress = sourceAddress;
        this.validatorPubkey = validatorPubkey;
        this.amount = amount;
    }
    serialize() {
        const amountBytes = this.amount === constants_js_1.BIGINT_0 ? new Uint8Array() : (0, bytes_js_1.bigIntToBytes)(this.amount);
        return (0, utils_1.concatBytes)(Uint8Array.from([this.type]), rlp_1.RLP.encode([this.sourceAddress, this.validatorPubkey, amountBytes]));
    }
    toJSON() {
        return {
            sourceAddress: (0, bytes_js_1.bytesToHex)(this.sourceAddress),
            validatorPubkey: (0, bytes_js_1.bytesToHex)(this.validatorPubkey),
            amount: (0, bytes_js_1.bigIntToHex)(this.amount),
        };
    }
}
exports.WithdrawalRequest = WithdrawalRequest;
class ConsolidationRequest extends CLRequest {
    constructor(sourceAddress, sourcePubkey, targetPubkey) {
        super(CLRequestType.Consolidation);
        this.sourceAddress = sourceAddress;
        this.sourcePubkey = sourcePubkey;
        this.targetPubkey = targetPubkey;
    }
    serialize() {
        return (0, utils_1.concatBytes)(Uint8Array.from([this.type]), rlp_1.RLP.encode([this.sourceAddress, this.sourcePubkey, this.targetPubkey]));
    }
    toJSON() {
        return {
            sourceAddress: (0, bytes_js_1.bytesToHex)(this.sourceAddress),
            sourcePubkey: (0, bytes_js_1.bytesToHex)(this.sourcePubkey),
            targetPubkey: (0, bytes_js_1.bytesToHex)(this.targetPubkey),
        };
    }
}
exports.ConsolidationRequest = ConsolidationRequest;
function createDepositRequest(depositData) {
    const { pubkey, withdrawalCredentials, amount, signature, index } = depositData;
    return new DepositRequest(pubkey, withdrawalCredentials, amount, signature, index);
}
exports.createDepositRequest = createDepositRequest;
function createDepositRequestFromJSON(jsonData) {
    const { pubkey, withdrawalCredentials, amount, signature, index } = jsonData;
    return createDepositRequest({
        pubkey: (0, bytes_js_1.hexToBytes)(pubkey),
        withdrawalCredentials: (0, bytes_js_1.hexToBytes)(withdrawalCredentials),
        amount: (0, bytes_js_1.hexToBigInt)(amount),
        signature: (0, bytes_js_1.hexToBytes)(signature),
        index: (0, bytes_js_1.hexToBigInt)(index),
    });
}
exports.createDepositRequestFromJSON = createDepositRequestFromJSON;
function createDepositRequestFromRLP(bytes) {
    const [pubkey, withdrawalCredentials, amount, signature, index] = rlp_1.RLP.decode(bytes);
    return createDepositRequest({
        pubkey,
        withdrawalCredentials,
        amount: (0, bytes_js_1.bytesToBigInt)(amount),
        signature,
        index: (0, bytes_js_1.bytesToBigInt)(index),
    });
}
exports.createDepositRequestFromRLP = createDepositRequestFromRLP;
function createWithdrawalRequest(withdrawalData) {
    const { sourceAddress, validatorPubkey, amount } = withdrawalData;
    return new WithdrawalRequest(sourceAddress, validatorPubkey, amount);
}
exports.createWithdrawalRequest = createWithdrawalRequest;
function createWithdrawalRequestFromJSON(jsonData) {
    const { sourceAddress, validatorPubkey, amount } = jsonData;
    return createWithdrawalRequest({
        sourceAddress: (0, bytes_js_1.hexToBytes)(sourceAddress),
        validatorPubkey: (0, bytes_js_1.hexToBytes)(validatorPubkey),
        amount: (0, bytes_js_1.hexToBigInt)(amount),
    });
}
exports.createWithdrawalRequestFromJSON = createWithdrawalRequestFromJSON;
function createWithdrawalRequestFromRLP(bytes) {
    const [sourceAddress, validatorPubkey, amount] = rlp_1.RLP.decode(bytes);
    return createWithdrawalRequest({
        sourceAddress,
        validatorPubkey,
        amount: (0, bytes_js_1.bytesToBigInt)(amount),
    });
}
exports.createWithdrawalRequestFromRLP = createWithdrawalRequestFromRLP;
function createConsolidationRequest(consolidationData) {
    const { sourceAddress, sourcePubkey, targetPubkey } = consolidationData;
    return new ConsolidationRequest(sourceAddress, sourcePubkey, targetPubkey);
}
exports.createConsolidationRequest = createConsolidationRequest;
function createConsolidationRequestFromJSON(jsonData) {
    const { sourceAddress, sourcePubkey, targetPubkey } = jsonData;
    return createConsolidationRequest({
        sourceAddress: (0, bytes_js_1.hexToBytes)(sourceAddress),
        sourcePubkey: (0, bytes_js_1.hexToBytes)(sourcePubkey),
        targetPubkey: (0, bytes_js_1.hexToBytes)(targetPubkey),
    });
}
exports.createConsolidationRequestFromJSON = createConsolidationRequestFromJSON;
function createConsolidationRequestFromRLP(bytes) {
    const [sourceAddress, sourcePubkey, targetPubkey] = rlp_1.RLP.decode(bytes);
    return createConsolidationRequest({
        sourceAddress,
        sourcePubkey,
        targetPubkey,
    });
}
exports.createConsolidationRequestFromRLP = createConsolidationRequestFromRLP;
class CLRequestFactory {
    static fromSerializedRequest(bytes) {
        switch (bytes[0]) {
            case CLRequestType.Deposit:
                return createDepositRequestFromRLP(bytes.subarray(1));
            case CLRequestType.Withdrawal:
                return createWithdrawalRequestFromRLP(bytes.subarray(1));
            case CLRequestType.Consolidation:
                return createConsolidationRequestFromRLP(bytes.subarray(1));
            default:
                throw Error(`Invalid request type=${bytes[0]}`);
        }
    }
}
exports.CLRequestFactory = CLRequestFactory;
//# sourceMappingURL=request.js.map