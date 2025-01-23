import type { AccessEventFlags, RawVerkleAccessedState, VerkleAccessWitnessInterface, VerkleAccessedState, VerkleAccessedStateWithAddress } from '@ethereumjs/common/dist/esm/index.js';
import type { Address, PrefixedHexString, VerkleCrypto } from '@ethereumjs/util/index.js';
type StemAccessEvent = {
    write?: boolean;
};
type ChunkAccessEvent = StemAccessEvent & {
    fill?: boolean;
};
type StemMeta = {
    address: Address;
    treeIndex: number | bigint;
};
export declare class VerkleAccessWitness implements VerkleAccessWitnessInterface {
    stems: Map<PrefixedHexString, StemAccessEvent & StemMeta>;
    chunks: Map<PrefixedHexString, ChunkAccessEvent>;
    verkleCrypto: VerkleCrypto;
    constructor(opts: {
        verkleCrypto: VerkleCrypto;
        stems?: Map<PrefixedHexString, StemAccessEvent & StemMeta>;
        chunks?: Map<PrefixedHexString, ChunkAccessEvent>;
    });
    touchAndChargeProofOfAbsence(address: Address): bigint;
    touchAndChargeMessageCall(address: Address): bigint;
    touchAndChargeValueTransfer(target: Address): bigint;
    touchAndChargeContractCreateInit(address: Address): bigint;
    touchAndChargeContractCreateCompleted(address: Address): bigint;
    touchTxOriginAndComputeGas(origin: Address): bigint;
    touchTxTargetAndComputeGas(target: Address, { sendsValue }?: {
        sendsValue?: boolean;
    }): bigint;
    touchCodeChunksRangeOnReadAndChargeGas(contact: Address, startPc: number, endPc: number): bigint;
    touchCodeChunksRangeOnWriteAndChargeGas(contact: Address, startPc: number, endPc: number): bigint;
    touchAddressOnWriteAndComputeGas(address: Address, treeIndex: number | bigint, subIndex: number | Uint8Array): bigint;
    touchAddressOnReadAndComputeGas(address: Address, treeIndex: number | bigint, subIndex: number | Uint8Array): bigint;
    touchAddressAndChargeGas(address: Address, treeIndex: number | bigint, subIndex: number | Uint8Array, { isWrite }: {
        isWrite?: boolean;
    }): bigint;
    touchAddress(address: Address, treeIndex: number | bigint, subIndex: number | Uint8Array, { isWrite }?: {
        isWrite?: boolean;
    }): AccessEventFlags;
    merge(accessWitness: VerkleAccessWitness): void;
    rawAccesses(): Generator<RawVerkleAccessedState>;
    accesses(): Generator<VerkleAccessedStateWithAddress>;
}
export declare function decodeAccessedState(treeIndex: number | bigint, chunkIndex: number): VerkleAccessedState;
export {};
//# sourceMappingURL=verkleAccessWitness.d.ts.map