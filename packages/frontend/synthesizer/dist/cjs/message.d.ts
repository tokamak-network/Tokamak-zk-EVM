import type { PrecompileFunc } from './precompiles/index.js';
import type { MemoryPts } from './tokamak/pointers/index.js';
import type { EOFEnv } from './types.js';
import type { VerkleAccessWitnessInterface } from '@ethereumjs/common/dist/esm/index.js';
import type { Address, PrefixedHexString } from "@ethereumjs/util/index.js";
interface MessageOpts {
    to?: Address;
    value?: bigint;
    caller?: Address;
    gasLimit: bigint;
    data?: Uint8Array;
    eofCallData?: Uint8Array;
    depth?: number;
    code?: Uint8Array | PrecompileFunc;
    codeAddress?: Address;
    isStatic?: boolean;
    isCompiled?: boolean;
    salt?: Uint8Array;
    /**
     * A set of addresses to selfdestruct, see {@link Message.selfdestruct}
     */
    selfdestruct?: Set<PrefixedHexString>;
    /**
     * Map of addresses which were created (used in EIP 6780)
     */
    createdAddresses?: Set<PrefixedHexString>;
    delegatecall?: boolean;
    gasRefund?: bigint;
    blobVersionedHashes?: PrefixedHexString[];
    accessWitness?: VerkleAccessWitnessInterface;
    memoryPts?: MemoryPts;
}
export declare class Message {
    to?: Address;
    value: bigint;
    caller: Address;
    gasLimit: bigint;
    data: Uint8Array;
    eofCallData?: Uint8Array;
    isCreate?: boolean;
    depth: number;
    code?: Uint8Array | PrecompileFunc;
    _codeAddress?: Address;
    isStatic: boolean;
    isCompiled: boolean;
    salt?: Uint8Array;
    eof?: EOFEnv;
    chargeCodeAccesses?: boolean;
    memoryPts?: MemoryPts;
    /**
     * Set of addresses to selfdestruct. Key is the unprefixed address.
     */
    selfdestruct?: Set<PrefixedHexString>;
    /**
     * Map of addresses which were created (used in EIP 6780)
     */
    createdAddresses?: Set<PrefixedHexString>;
    delegatecall: boolean;
    gasRefund: bigint;
    /**
     * List of versioned hashes if message is a blob transaction in the outer VM
     */
    blobVersionedHashes?: PrefixedHexString[];
    accessWitness?: VerkleAccessWitnessInterface;
    constructor(opts: MessageOpts);
    /**
     * Note: should only be called in instances where `_codeAddress` or `to` is defined.
     */
    get codeAddress(): Address;
}
export type MessageWithTo = Message & Pick<Required<MessageOpts>, 'to'>;
export {};
//# sourceMappingURL=message.d.ts.map