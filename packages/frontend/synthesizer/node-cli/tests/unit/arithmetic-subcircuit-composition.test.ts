import { describe, expect, it } from 'vitest';

import {
  OPERATOR_LIST,
} from '../../../core/src/subcircuit/configuredTypes.ts';
import {
  createPlacementCompositionMapping,
} from '../../../core/src/subcircuit/placementCompositionMapping.ts';

const mapping = createPlacementCompositionMapping({
  nPrivateMessageInputs: 29,
  nPoseidonBatch: 6,
});

describe('placement composition assembly', () => {
  it('contains every configured operator', () => {
    for (const operation of OPERATOR_LIST) {
      const definition = mapping[operation];
      expect(definition).toBeDefined();
      expect(definition.placementStrategy).toBe(
        operation === 'Poseidon'
          ? 'poseidon'
          : operation === 'MemoryView'
            ? 'memory-view'
            : 'generic',
      );
    }
  });

  it('uses the loaded structural constants in parameterized mappings', () => {
    expect(mapping.StorageAccess.numOperands).toBe(4);
    expect(mapping.Poseidon.numOperands).toBe('dynamic');
    expect(mapping.EXP.numSteps).toBe(258);
    expect(mapping.EXP.canonicalityGuardOperandIndices).toEqual([1]);
  });

  it('maps selector-free operations directly and declares only required input checks', () => {
    const directMappings = {
      ADD: { subcircuit: 'ADD', selector: null, checked: [0, 1] },
      MUL: { subcircuit: 'MUL', selector: null, checked: [] },
      SUB: { subcircuit: 'SUB', selector: null, checked: [0, 1] },
      NOT: { subcircuit: 'NOT', selector: null, checked: [] },
      EQ: { subcircuit: 'EQ', selector: null, checked: [] },
      ISZERO: { subcircuit: 'ISZERO', selector: null, checked: [] },
      LT: { subcircuit: 'LT', selector: null, checked: [0, 1] },
      GT: { subcircuit: 'GT', selector: null, checked: [0, 1] },
      SLT: { subcircuit: 'SLT', selector: null, checked: [0, 1] },
      SGT: { subcircuit: 'SGT', selector: null, checked: [0, 1] },
      AND: { subcircuit: 'AND', selector: null, checked: [] },
      OR: { subcircuit: 'OR', selector: null, checked: [] },
      XOR: { subcircuit: 'XOR', selector: null, checked: [] },
      SHR: { subcircuit: 'SHR', selector: null, checked: [0] },
      BYTE: { subcircuit: 'ALU3', selector: 1n << 1n, checked: [0] },
      SIGNEXTEND: { subcircuit: 'ALU3', selector: 1n << 0n, checked: [0] },
      SAR: { subcircuit: 'ALU3', selector: 1n << 2n, checked: [0] },
    } as const;

    for (const [operation, expected] of Object.entries(directMappings)) {
      const composition = mapping[operation as keyof typeof directMappings];
      expect(composition.steps).toHaveLength(1);
      expect(composition.steps[0]!.subcircuit).toBe(expected.subcircuit);
      expect(composition.steps[0]!.selector).toBe(expected.selector);
      expect(composition.canonicalityGuardOperandIndices).toEqual(expected.checked);
    }
  });

  it('uses the reserved power-of-two selector range for the division family', () => {
    const expectedSelectors = {
      DIV: 1n << 3n,
      SDIV: 1n << 4n,
      MOD: 1n << 5n,
      SMOD: 1n << 6n,
    } as const;

    for (const [operation, selector] of Object.entries(expectedSelectors)) {
      expect(mapping[operation as keyof typeof expectedSelectors].steps[0]!.selector).toBe(selector);
    }
  });

  it('rejects a non-positive Poseidon batch size', () => {
    expect(() => createPlacementCompositionMapping({
      nPrivateMessageInputs: 29,
      nPoseidonBatch: 0,
    })).toThrow('nPoseidonBatch must be a positive integer');
  });

  it('freezes the mapping and every composition definition', () => {
    expect(Object.isFrozen(mapping)).toBe(true);
    for (const operation of OPERATOR_LIST) {
      expect(Object.isFrozen(mapping[operation])).toBe(true);
    }
  });

  it('does not retain usage metadata on composition steps', () => {
    for (const operation of OPERATOR_LIST) {
      for (const step of mapping[operation].steps) {
        expect(step).not.toHaveProperty('usage');
      }
    }
  });
});
