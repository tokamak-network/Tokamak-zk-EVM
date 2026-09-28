import { jubjub } from '@noble/curves/misc.js';
import { poseidonChainCompress } from 'tokamak-l2js';
import { describe, expect, it } from 'vitest';

import type { CompositionSubcircuit } from '../../../core/src/subcircuit/configuredTypes.ts';
import { createTransactionSignatureVerifyCompositionMapping } from '../../../core/src/subcircuit/special-builders/txSignVerifyComposition.ts';
import { calculateSubcircuitOutputValues } from '../../../core/src/subcircuit/subcircuitOutputOperations.ts';

describe('transaction-signature host output calculations', () => {
  it('reproduces the complete production TSV witness flow', () => {
    const privateKey = 37n;
    const randomizerScalar = 61n;
    const publicKey = jubjub.Point.BASE.multiply(privateKey).toAffine();
    const randomizer = jubjub.Point.BASE.multiply(randomizerScalar).toAffine();
    const channelTransactionIndex = 19n;
    const contractAddress = 0x1234567890abcdef1234567890abcdef12345678n;
    const functionSelector = 0xdeadbeefn;
    const transactionInputs = Array.from({ length: 29 }, (_, index) => BigInt(index + 1));
    const challengeInputs = [
      randomizer.x,
      randomizer.y,
      publicKey.x,
      publicKey.y,
      channelTransactionIndex,
      contractAddress,
      functionSelector,
      ...transactionInputs,
    ];
    const challenge = poseidonChainCompress(challengeInputs);
    const response = (randomizerScalar + challenge * privateKey) % jubjub.Point.Fn.ORDER;
    const modulus = jubjub.Point.Fp.ORDER;
    const inverse = (value: bigint): bigint => {
      let base = value % modulus;
      let exponent = modulus - 2n;
      let result = 1n;
      while (exponent > 0n) {
        if ((exponent & 1n) === 1n) result = (result * base) % modulus;
        base = (base * base) % modulus;
        exponent >>= 1n;
      }
      return result;
    };
    const toAffine = (extended: readonly bigint[]) => ({
      x: (extended[0]! * inverse(extended[2]!)) % modulus,
      y: (extended[1]! * inverse(extended[2]!)) % modulus,
    });
    expect(toAffine(calculateSubcircuitOutputValues('TransactionSignatureFixedPrefix70', [1n]).slice(1))).toEqual(
      jubjub.Point.BASE.multiply(8n).toAffine(),
    );
    const prefix = calculateSubcircuitOutputValues('TransactionSignatureFixedPrefix70', [response]);
    const policy = calculateSubcircuitOutputValues('TransactionSignaturePointPolicy', [
      randomizer.x,
      randomizer.y,
      publicKey.x,
      publicKey.y,
      contractAddress,
      functionSelector,
      0n,
      1n,
    ]);
    expect([policy[4], policy[5]]).toEqual(Object.values(jubjub.Point.BASE.multiply(8n * privateKey).toAffine()));
    expect(toAffine(prefix.slice(1))).toEqual(
      jubjub.Point.BASE.multiply(8n * (response & ((1n << 210n) - 1n))).toAffine(),
    );
    const operands = [
      randomizer.x,
      randomizer.y,
      publicKey.x,
      publicKey.y,
      channelTransactionIndex,
      ...transactionInputs,
      contractAddress,
      functionSelector,
      response,
      0n,
      1n,
    ];

    const { composition } = createTransactionSignatureVerifyCompositionMapping(29);
    expect(composition.steps).toHaveLength(17);
    expect(composition.steps.map(step => step.subcircuit)).toContain('TransactionSignatureChallengeChunks');
    expect(composition.steps.map(step => step.subcircuit)).toContain('TransactionSignatureVariableFirstBatch32');
    expect(composition.steps.filter(step => step.subcircuit === 'TransactionSignatureVariableBatch32')).toHaveLength(3);
    const intermediates = new Map<number, bigint>();
    const results = new Map<number, bigint>();
    for (const step of composition.steps) {
      const values = step.inputs.map(input => {
        switch (input.kind) {
          case 'operand':
            return operands[input.index]!;
          case 'constant':
            return composition.constants[input.index]!.value;
          case 'step-output':
            return intermediates.get(input.index)!;
          case 'selector':
            throw new Error('TSV does not use selector inputs');
        }
      });
      const calculated = calculateSubcircuitOutputValues(step.subcircuit as CompositionSubcircuit, values);
      step.outputs.forEach((output, index) => {
        if (output.kind === 'step-output') intermediates.set(output.index, calculated[index]!);
        if (output.kind === 'result') results.set(output.index, calculated[index]!);
      });
    }

    expect(results.get(0)).toBe(contractAddress);
    expect(results.get(1)).toBe(functionSelector);
    expect(results.get(2)).toBe(poseidonChainCompress([publicKey.x, publicKey.y]) & ((1n << 160n) - 1n));
  });

  it('rejects a non-canonical challenge hash before packing it', () => {
    const modulus = jubjub.Point.Fp.ORDER;
    expect(() => calculateSubcircuitOutputValues('TransactionSignatureChallengeChunks', [modulus])).toThrow(
      'challenge hash is not a canonical BLS12-381 Fr value',
    );
  });

  it.each([28, 29, 30, 31])('uses the TokamakL2JS Poseidon chain for %i private inputs', (numberOfPrivateMessageInputs) => {
    const privateKey = 37n;
    const randomizerScalar = 61n;
    const publicKey = jubjub.Point.BASE.multiply(privateKey).toAffine();
    const randomizer = jubjub.Point.BASE.multiply(randomizerScalar).toAffine();
    const channelTransactionIndex = 19n;
    const contractAddress = 0x1234567890abcdef1234567890abcdef12345678n;
    const functionSelector = 0xdeadbeefn;
    const transactionInputs = Array.from(
      { length: numberOfPrivateMessageInputs },
      (_, index) => BigInt(index + 1),
    );
    const challenge = poseidonChainCompress([
      randomizer.x,
      randomizer.y,
      publicKey.x,
      publicKey.y,
      channelTransactionIndex,
      contractAddress,
      functionSelector,
      ...transactionInputs,
    ]);
    const response = (randomizerScalar + challenge * privateKey) % jubjub.Point.Fn.ORDER;
    const operands = [
      randomizer.x,
      randomizer.y,
      publicKey.x,
      publicKey.y,
      channelTransactionIndex,
      ...transactionInputs,
      contractAddress,
      functionSelector,
      response,
      0n,
      1n,
    ];
    const { composition } = createTransactionSignatureVerifyCompositionMapping(numberOfPrivateMessageInputs);
    const intermediates = new Map<number, bigint>();
    let challengeInput: bigint | undefined;

    for (const step of composition.steps) {
      const values = step.inputs.map((input) => {
        if (input.kind === 'operand') return operands[input.index]!;
        if (input.kind === 'constant') return composition.constants[input.index]!.value;
        if (input.kind === 'step-output') return intermediates.get(input.index)!;
        throw new Error('TSV does not use selector inputs');
      });
      if (step.subcircuit === 'TransactionSignatureChallengeChunks') challengeInput = values[0];
      const calculated = calculateSubcircuitOutputValues(step.subcircuit as CompositionSubcircuit, values);
      step.outputs.forEach((output, index) => {
        if (output.kind === 'step-output') intermediates.set(output.index, calculated[index]!);
      });
    }

    expect(challengeInput).toBe(challenge);
  });
});
