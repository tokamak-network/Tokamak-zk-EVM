"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const poseidon_bls12381_1 = require("poseidon-bls12381");
const chai_1 = require("chai");
const circom_tester_1 = require("circom_tester");
describe('Poseidon2 Implementation Comparison', () => {
    it('should produce the same hash for the same input', async () => {
        const circuit = await (0, circom_tester_1.wasm)('circuits/poseidon2.circom', { template: "Compression" });
        const input = [1n, 2n];
        // TypeScript implementation
        const tsHash = (0, poseidon_bls12381_1.poseidon2)(input);
        // Circom implementation
        const witness = await circuit.calculateWitness({ inputs: input });
        const circomHash = await circuit.getOutput(witness, ['out']);
        (0, chai_1.expect)(tsHash.toString()).to.equal(circomHash.out.toString());
    });
});
