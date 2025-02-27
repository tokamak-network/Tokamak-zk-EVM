<<<<<<< HEAD
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
=======
import type { Proof } from '../index.js';
import type { StatelessVerkleStateManager } from '../statelessVerkleStateManager.js';
import type { Address } from '@synthesizer-libs/util';
export declare function getVerkleStateProof(sm: StatelessVerkleStateManager, _: Address, __?: Uint8Array[]): Promise<Proof>;
/**
 * Verifies whether the execution witness matches the stateRoot
 * @param {Uint8Array} stateRoot - The stateRoot to verify the executionWitness against
 * @returns {boolean} - Returns true if the executionWitness matches the provided stateRoot, otherwise false
 */
export declare function verifyVerkleStateProof(sm: StatelessVerkleStateManager): boolean;
>>>>>>> 603bf51d9e02a58183fabb7f7fd08e9580ceef44
//# sourceMappingURL=verkle.d.ts.map