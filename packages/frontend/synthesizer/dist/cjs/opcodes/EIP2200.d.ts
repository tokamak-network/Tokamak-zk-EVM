import type { RunState } from '../interpreter.js';
import type { Common } from '@ethereumjs/common/dist/esm/index.js';
/**
 * Adjusts gas usage and refunds of SStore ops per EIP-2200 (Istanbul)
 *
 * @param {RunState} runState
 * @param {Uint8Array}   currentStorage
 * @param {Uint8Array}   originalStorage
 * @param {Uint8Array}   value
 * @param {Common}   common
 */
export declare function updateSstoreGasEIP2200(runState: RunState, currentStorage: Uint8Array, originalStorage: Uint8Array, value: Uint8Array, key: Uint8Array, common: Common): bigint;
//# sourceMappingURL=EIP2200.d.ts.map