
import { poseidon2 } from 'poseidon-bls12381';
import { expect } from 'chai';
import { wasm as wasm_tester } from 'circom_tester';

import * as path from 'path';

describe('Poseidon2 Implementation Comparison', () => {
  it('should produce the same hash for the same input', async function() {
    const circuit = await wasm_tester(path.join(__dirname, '../../circom/poseidon.circom'), {
      prime: 'bls12381',
      include: [path.join(__dirname, '../../node_modules')]
    });

    const input = [1n, 2n];

    const tsHash = poseidon2(input);
    console.log('TS Hash:', tsHash.toString());

    // Circom implementation
    console.log('Calculating witness...');
    const witness = await circuit.calculateWitness({ in: input });
    console.log('Witness calculated.');
    const circomHash = await circuit.getOutput(witness, { out: 1 });
    console.log('Circom Full Hash:', circomHash.out.toString());

    

    expect(tsHash.toString()).to.equal(circomHash.out.toString());
  });
});
