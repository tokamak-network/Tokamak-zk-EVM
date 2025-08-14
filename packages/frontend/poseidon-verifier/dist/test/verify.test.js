"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const poseidon_bls12381_1 = require("poseidon-bls12381");
const chai_1 = require("chai");
const circom_tester_1 = require("circom_tester");
const path = __importStar(require("path"));
describe('Poseidon2 Implementation Comparison', () => {
    it('should produce the same hash for the same input', async function () {
        const circuit = await (0, circom_tester_1.wasm)(path.join(__dirname, '../../circom/poseidon.circom'), {
            prime: 'bls12381',
            include: [path.join(__dirname, '../../node_modules')]
        });
        const input = [1n, 2n];
        const tsHash = (0, poseidon_bls12381_1.poseidon2)(input);
        console.log('TS Hash:', tsHash.toString());
        // Circom implementation
        console.log('Calculating witness...');
        const witness = await circuit.calculateWitness({ in: input });
        console.log('Witness calculated.');
        const circomHash = await circuit.getOutput(witness, { out: 1 });
        console.log('Circom Full Hash:', circomHash.out.toString());
        (0, chai_1.expect)(tsHash.toString()).to.equal(circomHash.out.toString());
    });
});
//# sourceMappingURL=verify.test.js.map