import type {
  InputReference,
  PlacementCompositionEntry,
} from '../placementCompositionMapping.ts'

/** Defines one or more logical memory-view reconstructions. */
export const createMemoryViewCompositionMapping = (): PlacementCompositionEntry =>
  ({
    operation: 'MemoryView',
    composition: {
      placementStrategy: 'memory-view',
      constants: [],
      canonicalityGuardOperandIndices: [],
      numSteps: 'dynamic',
      numOperands: 'dynamic',
      numResults: 'dynamic',
      steps: [
        {
          subcircuit: 'MemoryViewStep',
          selector: null,
          inputs: Array.from(
            { length: 5 },
            (_, index): InputReference => ({ kind: 'operand', index }),
          ),
          outputs: [
            { kind: 'result', index: 'dynamic' },
            { kind: 'discard' },
          ]
        }
      ]
    }
  })
