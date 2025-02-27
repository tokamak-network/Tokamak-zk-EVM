<<<<<<< HEAD
import type { Proof, RPCStateManager } from '../index.js';
import type { Address } from '@ethereumjs/util';
/**
 * Get an EIP-1186 proof from the provider
 * @param address address to get proof of
 * @param storageSlots storage slots to get proof of
 * @returns an EIP-1186 formatted proof
 */
export declare function getRPCStateProof(sm: RPCStateManager, address: Address, storageSlots?: Uint8Array[]): Promise<Proof>;
=======
import type { Proof, RPCStateManager } from '../index.js';
import type { Address } from '@synthesizer-libs/util';
/**
 * Get an EIP-1186 proof from the provider
 * @param address address to get proof of
 * @param storageSlots storage slots to get proof of
 * @returns an EIP-1186 formatted proof
 */
export declare function getRPCStateProof(sm: RPCStateManager, address: Address, storageSlots?: Uint8Array[]): Promise<Proof>;
>>>>>>> 603bf51d9e02a58183fabb7f7fd08e9580ceef44
//# sourceMappingURL=rpc.d.ts.map