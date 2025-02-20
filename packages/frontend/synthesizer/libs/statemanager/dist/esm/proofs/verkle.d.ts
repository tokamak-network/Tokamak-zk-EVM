import type { Proof } from '../index.js';
import type { StatelessVerkleStateManager } from '../statelessVerkleStateManager.js';
import type { Address } from '@ethereumjs/util';
export declare function getVerkleStateProof(sm: StatelessVerkleStateManager, _: Address, __?: Uint8Array[]): Promise<Proof>;
/**
 * Verifies whether the execution witness matches the stateRoot
 * @param {Uint8Array} stateRoot - The stateRoot to verify the executionWitness against
 * @returns {boolean} - Returns true if the executionWitness matches the provided stateRoot, otherwise false
 */
export declare function verifyVerkleStateProof(sm: StatelessVerkleStateManager): boolean;
//# sourceMappingURL=verkle.d.ts.map