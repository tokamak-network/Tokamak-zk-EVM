"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyVerkleStateProof = exports.getVerkleStateProof = void 0;
const util_1 = require("@ethereumjs/util");
function getVerkleStateProof(sm, _, __ = []) {
    throw new Error('Not implemented yet');
}
exports.getVerkleStateProof = getVerkleStateProof;
/**
 * Verifies whether the execution witness matches the stateRoot
 * @param {Uint8Array} stateRoot - The stateRoot to verify the executionWitness against
 * @returns {boolean} - Returns true if the executionWitness matches the provided stateRoot, otherwise false
 */
function verifyVerkleStateProof(sm) {
    if (sm['_executionWitness'] === undefined) {
        sm['DEBUG'] && sm['_debug']('Missing executionWitness');
        return false;
    }
    return (0, util_1.verifyVerkleProof)(sm.verkleCrypto, sm['_executionWitness']);
}
exports.verifyVerkleStateProof = verifyVerkleStateProof;
//# sourceMappingURL=verkle.js.map