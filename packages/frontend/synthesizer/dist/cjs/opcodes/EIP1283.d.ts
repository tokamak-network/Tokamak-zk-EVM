import type { RunState } from '../interpreter.js';
import type { Common } from '@ethereumjs/common/dist/esm/index.js';
/**
 * Adjusts gas usage and refunds of SStore ops per EIP-1283 (Constantinople)
 *
 * @param {RunState} runState
 * @param {Uint8Array}   currentStorage
 * @param {Uint8Array}   originalStorage
 * @param {Uint8Array}   value
 * @param {Common}   common
 */
export declare function updateSstoreGasEIP1283(runState: RunState, currentStorage: Uint8Array, originalStorage: Uint8Array, value: Uint8Array, common: Common): bigint;
//# sourceMappingURL=EIP1283.d.ts.map