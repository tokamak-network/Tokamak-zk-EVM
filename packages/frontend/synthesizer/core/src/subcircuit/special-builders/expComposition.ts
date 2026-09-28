import { UINT256_DATA_PT_TYPE } from '../../synthesizer/types/dataStructure.ts'
import type {
  PlacementCompositionEntry,
  CompositionStep,
  ConstantDefinition,
  InputReference,
  OutputReference
} from '../placementCompositionMapping.ts'

const NUM_EXPONENT_STEPS = 256

export const createExpCompositionMapping = (): PlacementCompositionEntry => {
  const constants: readonly ConstantDefinition[] = [
    {
      value: 1n,
      dataPtType: UINT256_DATA_PT_TYPE,
    }
  ]
  const steps: CompositionStep[] = []

  for (let stepIndex = 0; stepIndex < NUM_EXPONENT_STEPS; stepIndex++) {
    const isFirstStep = stepIndex === 0
    const isFinalStep = stepIndex === NUM_EXPONENT_STEPS - 1
    const stateInputs: InputReference[] = isFirstStep
      ? [
          { kind: 'constant', index: 0 },
          { kind: 'operand', index: 0 },
          { kind: 'operand', index: 1 },
        ]
      : [
          { kind: 'step-output', index: 3 * (stepIndex - 1) },
          { kind: 'step-output', index: 3 * (stepIndex - 1) + 1 },
          { kind: 'step-output', index: 3 * (stepIndex - 1) + 2 },
        ]
    const outputs: OutputReference[] = isFinalStep
      ? [{
          kind: 'step-output',
          index: 3 * stepIndex,
          resultIndex: 0,
        }, { kind: 'discard' }, {
          kind: 'step-output',
          index: 3 * stepIndex + 1,
        }]
      : [
          { kind: 'step-output', index: 3 * stepIndex },
          { kind: 'step-output', index: 3 * stepIndex + 1 },
          { kind: 'step-output', index: 3 * stepIndex + 2 },
        ]

    steps.push({
      subcircuit: 'SubExp',
      selector: null,
      inputs: stateInputs,
      outputs
    })
  }

  steps.push({
    subcircuit: 'AssertZeroWord',
    selector: null,
    inputs: [{ kind: 'step-output', index: 3 * (NUM_EXPONENT_STEPS - 1) + 1 }],
    outputs: []
  })

  steps.push({
    subcircuit: 'CheckBus256',
    selector: null,
    inputs: [
      {
        kind: 'step-output',
        index: 3 * (NUM_EXPONENT_STEPS - 1)
      }
    ],
    outputs: []
  })

  return {
    operation: 'EXP',
    composition: {
      placementStrategy: 'generic',
      constants,
      canonicalityGuardOperandIndices: [1],
      numSteps: steps.length,
      numOperands: 2,
      numResults: 1,
      steps
    }
  }
}
