import { verifyVerkleProof } from '@synthesizer-libs/util';
export function getVerkleStateProof(sm, _, __ = []) {
    throw new Error('Not implemented yet');
}
/**
 * Verifies whether the execution witness matches the stateRoot
 * @param {Uint8Array} stateRoot - The stateRoot to verify the executionWitness against
 * @returns {boolean} - Returns true if the executionWitness matches the provided stateRoot, otherwise false
 */
export function verifyVerkleStateProof(sm) {
    if (sm['_executionWitness'] === undefined) {
        sm['DEBUG'] && sm['_debug']('Missing executionWitness');
        return false;
    }
    return verifyVerkleProof(sm.verkleCrypto, sm['_executionWitness']);
}
//# sourceMappingURL=verkle.js.map