import type { PlacementCompositionEntry } from '../placementCompositionMapping.ts'

const createAddModCompositionMapping = (): PlacementCompositionEntry =>
  ({
    operation: 'ADDMOD',
    composition: {
      placementStrategy: 'generic',
      constants: [],
      canonicalityGuardOperandIndices: [],
      numSteps: 2,
      numOperands: 3,
      numResults: 1,
      steps: [
        {
          subcircuit: 'ADDMODPrepare',
          selector: null,
          inputs: [
            { kind: 'operand', index: 0 },
            { kind: 'operand', index: 1 },
            { kind: 'operand', index: 2 }
          ],
          outputs: Array.from({ length: 7 }, (_, index) => ({ kind: 'step-output' as const, index }))
        },
        {
          subcircuit: 'ADDMODVerify',
          selector: null,
          inputs: [
            { kind: 'step-output', index: 0 },
            { kind: 'step-output', index: 1 },
            { kind: 'step-output', index: 2 },
            { kind: 'operand', index: 2 },
            { kind: 'step-output', index: 3 },
            { kind: 'step-output', index: 4 },
            { kind: 'step-output', index: 5 },
            { kind: 'step-output', index: 6 }
          ],
          outputs: [{ kind: 'result', index: 0 }]
        }
      ]
    }
  })

const createMulModCompositionMapping = (): PlacementCompositionEntry =>
  ({
    operation: 'MULMOD',
    composition: {
      placementStrategy: 'generic',
      constants: [],
      canonicalityGuardOperandIndices: [],
      numSteps: 3,
      numOperands: 3,
      numResults: 1,
      steps: [
        {
          subcircuit: 'MULMODPrepare',
          selector: null,
          inputs: [
            { kind: 'operand', index: 0 },
            { kind: 'operand', index: 1 },
            { kind: 'operand', index: 2 }
          ],
          outputs: Array.from({ length: 15 }, (_, index) => ({ kind: 'step-output' as const, index }))
        },
        {
          subcircuit: 'MULMODCandidate',
          selector: null,
          inputs: [
            { kind: 'step-output', index: 12 },
            { kind: 'step-output', index: 13 },
            { kind: 'step-output', index: 14 }
          ],
          outputs: Array.from({ length: 12 }, (_, index) => ({ kind: 'step-output' as const, index: 15 + index }))
        },
        {
          subcircuit: 'MULMODVerify',
          selector: null,
          inputs: [
            ...Array.from({ length: 12 }, (_, index) => ({ kind: 'step-output' as const, index })),
            ...Array.from({ length: 12 }, (_, index) => ({ kind: 'step-output' as const, index: 15 + index }))
          ],
          outputs: [{ kind: 'result', index: 0 }]
        }
      ]
    }
  })

export const createAddMulModCompositionMappings = (): readonly PlacementCompositionEntry[] =>
  [createAddModCompositionMapping(), createMulModCompositionMapping()]
