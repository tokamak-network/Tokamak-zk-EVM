import type { PrefixedHexString } from './types.js';
export type RequestBytes = Uint8Array;
export declare enum CLRequestType {
    Deposit = 0,
    Withdrawal = 1,
    Consolidation = 2
}
export type DepositRequestV1 = {
    pubkey: PrefixedHexString;
    withdrawalCredentials: PrefixedHexString;
    amount: PrefixedHexString;
    signature: PrefixedHexString;
    index: PrefixedHexString;
};
export type WithdrawalRequestV1 = {
    sourceAddress: PrefixedHexString;
    validatorPubkey: PrefixedHexString;
    amount: PrefixedHexString;
};
export type ConsolidationRequestV1 = {
    sourceAddress: PrefixedHexString;
    sourcePubkey: PrefixedHexString;
    targetPubkey: PrefixedHexString;
};
export interface RequestJSON {
    [CLRequestType.Deposit]: DepositRequestV1;
    [CLRequestType.Withdrawal]: WithdrawalRequestV1;
    [CLRequestType.Consolidation]: ConsolidationRequestV1;
}
export type DepositRequestData = {
    pubkey: Uint8Array;
    withdrawalCredentials: Uint8Array;
    amount: bigint;
    signature: Uint8Array;
    index: bigint;
};
export type WithdrawalRequestData = {
    sourceAddress: Uint8Array;
    validatorPubkey: Uint8Array;
    amount: bigint;
};
export type ConsolidationRequestData = {
    sourceAddress: Uint8Array;
    sourcePubkey: Uint8Array;
    targetPubkey: Uint8Array;
};
export interface RequestData {
    [CLRequestType.Deposit]: DepositRequestData;
    [CLRequestType.Withdrawal]: WithdrawalRequestData;
    [CLRequestType.Consolidation]: ConsolidationRequestData;
}
export type TypedRequestData = RequestData[CLRequestType];
export interface CLRequestInterface<T extends CLRequestType = CLRequestType> {
    readonly type: T;
    serialize(): Uint8Array;
    toJSON(): RequestJSON[T];
}
export declare abstract class CLRequest<T extends CLRequestType> implements CLRequestInterface<T> {
    readonly type: T;
    abstract serialize(): Uint8Array;
    abstract toJSON(): RequestJSON[T];
    constructor(type: T);
}
export declare class DepositRequest extends CLRequest<CLRequestType.Deposit> {
    readonly pubkey: Uint8Array;
    readonly withdrawalCredentials: Uint8Array;
    readonly amount: bigint;
    readonly signature: Uint8Array;
    readonly index: bigint;
    constructor(pubkey: Uint8Array, withdrawalCredentials: Uint8Array, amount: bigint, signature: Uint8Array, index: bigint);
    serialize(): Uint8Array;
    toJSON(): DepositRequestV1;
}
export declare class WithdrawalRequest extends CLRequest<CLRequestType.Withdrawal> {
    readonly sourceAddress: Uint8Array;
    readonly validatorPubkey: Uint8Array;
    readonly amount: bigint;
    constructor(sourceAddress: Uint8Array, validatorPubkey: Uint8Array, amount: bigint);
    serialize(): Uint8Array;
    toJSON(): WithdrawalRequestV1;
}
export declare class ConsolidationRequest extends CLRequest<CLRequestType.Consolidation> {
    readonly sourceAddress: Uint8Array;
    readonly sourcePubkey: Uint8Array;
    readonly targetPubkey: Uint8Array;
    constructor(sourceAddress: Uint8Array, sourcePubkey: Uint8Array, targetPubkey: Uint8Array);
    serialize(): Uint8Array;
    toJSON(): ConsolidationRequestV1;
}
export declare function createDepositRequest(depositData: DepositRequestData): DepositRequest;
export declare function createDepositRequestFromJSON(jsonData: DepositRequestV1): DepositRequest;
export declare function createDepositRequestFromRLP(bytes: Uint8Array): DepositRequest;
export declare function createWithdrawalRequest(withdrawalData: WithdrawalRequestData): WithdrawalRequest;
export declare function createWithdrawalRequestFromJSON(jsonData: WithdrawalRequestV1): WithdrawalRequest;
export declare function createWithdrawalRequestFromRLP(bytes: Uint8Array): WithdrawalRequest;
export declare function createConsolidationRequest(consolidationData: ConsolidationRequestData): ConsolidationRequest;
export declare function createConsolidationRequestFromJSON(jsonData: ConsolidationRequestV1): ConsolidationRequest;
export declare function createConsolidationRequestFromRLP(bytes: Uint8Array): ConsolidationRequest;
export declare class CLRequestFactory {
    static fromSerializedRequest(bytes: Uint8Array): CLRequest<CLRequestType>;
}
//# sourceMappingURL=request.d.ts.map