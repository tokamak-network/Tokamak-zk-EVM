import type { PlacementCompositionEntry, InputReference, OutputReference } from '../placementCompositionMapping.ts'

const createDivisionCompositionMapping = (
  operation: 'DIV' | 'SDIV' | 'MOD' | 'SMOD',
  selector: bigint
): PlacementCompositionEntry =>
  ({
    operation,
    composition: {
      placementStrategy: 'generic',
      constants: [],
      canonicalityGuardOperandIndices: [],
      numSteps: 2,
      numOperands: 2,
      numResults: 1,
      steps: [
        {
          subcircuit: 'ALU4A',
          selector,
          inputs: [{ kind: 'selector' }, { kind: 'operand', index: 0 }, { kind: 'operand', index: 1 }],
          outputs: Array.from({ length: 10 }, (_, index): OutputReference => ({ kind: 'step-output', index }))
        },
        {
          subcircuit: 'ALU4B',
          selector: null,
          inputs: Array.from({ length: 10 }, (_, index): InputReference => ({ kind: 'step-output', index })),
          outputs: [{ kind: 'result', index: 0 }]
        }
      ]
    }
  })

export const createDivisionCompositionMappings = (): readonly PlacementCompositionEntry[] =>
  [
    createDivisionCompositionMapping('DIV', 1n << 3n),
    createDivisionCompositionMapping('SDIV', 1n << 4n),
    createDivisionCompositionMapping('MOD', 1n << 5n),
    createDivisionCompositionMapping('SMOD', 1n << 6n)
  ]
