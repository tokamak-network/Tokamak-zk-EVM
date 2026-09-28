import { BIT_DATA_PT_TYPE, BLS12_381_FR_DATA_PT_TYPE } from '../../synthesizer/types/dataStructure.ts';
import type {
  ConstantDefinition,
  CompositionStep,
  InputReference,
  OutputReference,
  PlacementCompositionEntry,
} from '../placementCompositionMapping.ts';

const NUM_RUNTIME_TABLE_COORDINATES = 8;
const NUM_EXTENDED_COORDINATES = 4;
const NUM_CHALLENGE_CHUNKS = 4;

const challengeInput = (index: number, contractOperandIndex: number, selectorOperandIndex: number): InputReference => {
  if (index < 5) {
    return { kind: 'operand', index };
  }
  if (index === 5) {
    return { kind: 'operand', index: contractOperandIndex };
  }
  if (index === 6) {
    return { kind: 'operand', index: selectorOperandIndex };
  }
  return { kind: 'operand', index: index - 2 };
};

export const createTransactionSignatureVerifyCompositionMapping = (
  numberOfPrivateMessageInputs: number,
): PlacementCompositionEntry => {
  const contractOperandIndex = numberOfPrivateMessageInputs + 5;
  const selectorOperandIndex = contractOperandIndex + 1;
  const responseOperandIndex = selectorOperandIndex + 1;
  const identityXOperandIndex = responseOperandIndex + 1;
  const identityYOperandIndex = identityXOperandIndex + 1;
  const numberOfOperands = identityYOperandIndex + 1;
  const steps: CompositionStep[] = [];
  let nextIntermediateIndex = 0;
  const allocateIntermediate = (): number => nextIntermediateIndex++;
  const allocateIntermediates = (length: number): number[] => Array.from({ length }, () => allocateIntermediate());

  const chainModeConstantIndex = 0;
  const zeroFieldConstantIndex = 1;
  const challengeLength = numberOfPrivateMessageInputs + 7;
  const tailLength = (numberOfPrivateMessageInputs + 2) % 4 || 4;
  const numberOfFullChainBatches = (challengeLength - tailLength - 1) / 4;
  if (!Number.isInteger(numberOfFullChainBatches) || numberOfFullChainBatches < 1) {
    throw new Error('TransactionSignatureVerify has an invalid Poseidon chain shape');
  }
  const independentModeConstantIndex = tailLength === 3 ? 2 : undefined;

  let previousChallengeHashIndex: number | undefined;
  for (let batch = 0; batch < numberOfFullChainBatches; batch++) {
    const finalHashIndex = allocateIntermediate();
    const challengeOffset = 4 * batch;
    steps.push({
      subcircuit: 'TransactionSignaturePoseidonBatch4',
      selector: null,
      inputs: [
        { kind: 'constant', index: chainModeConstantIndex },
        previousChallengeHashIndex === undefined
          ? challengeInput(0, contractOperandIndex, selectorOperandIndex)
          : { kind: 'step-output', index: previousChallengeHashIndex },
        challengeInput(challengeOffset + 1, contractOperandIndex, selectorOperandIndex),
        { kind: 'constant', index: zeroFieldConstantIndex },
        challengeInput(challengeOffset + 2, contractOperandIndex, selectorOperandIndex),
        challengeInput(challengeOffset + 3, contractOperandIndex, selectorOperandIndex),
        challengeInput(challengeOffset + 4, contractOperandIndex, selectorOperandIndex),
      ],
      outputs: [{ kind: 'discard' }, { kind: 'step-output', index: finalHashIndex }],
    });
    previousChallengeHashIndex = finalHashIndex;
  }

  if (previousChallengeHashIndex === undefined) {
    throw new Error('TransactionSignatureVerify requires a challenge hash chain');
  }

  const tailStart = 4 * numberOfFullChainBatches + 1;
  let publicKeyHashIndex = allocateIntermediate();
  let challengeHashIndex: number;
  if (tailLength === 3) {
    challengeHashIndex = allocateIntermediate();
    steps.push({
      subcircuit: 'TransactionSignaturePoseidonBatch4',
      selector: null,
      inputs: [
        { kind: 'constant', index: independentModeConstantIndex! },
        challengeInput(2, contractOperandIndex, selectorOperandIndex),
        challengeInput(3, contractOperandIndex, selectorOperandIndex),
        { kind: 'step-output', index: previousChallengeHashIndex },
        challengeInput(tailStart, contractOperandIndex, selectorOperandIndex),
        challengeInput(tailStart + 1, contractOperandIndex, selectorOperandIndex),
        challengeInput(tailStart + 2, contractOperandIndex, selectorOperandIndex),
      ],
      outputs: [
        { kind: 'step-output', index: publicKeyHashIndex },
        { kind: 'step-output', index: challengeHashIndex },
      ],
    });
  } else if (tailLength === 1 || tailLength === 2) {
    challengeHashIndex = allocateIntermediate();
    steps.push({
      subcircuit: tailLength === 1
        ? 'TransactionSignaturePoseidonTail1'
        : 'TransactionSignaturePoseidonTail2',
      selector: null,
      inputs: [
        challengeInput(2, contractOperandIndex, selectorOperandIndex),
        challengeInput(3, contractOperandIndex, selectorOperandIndex),
        { kind: 'step-output', index: previousChallengeHashIndex },
        ...Array.from({ length: tailLength }, (_, tailOffset): InputReference =>
          challengeInput(tailStart + tailOffset, contractOperandIndex, selectorOperandIndex),
        ),
      ],
      outputs: [
        { kind: 'step-output', index: publicKeyHashIndex },
        { kind: 'step-output', index: challengeHashIndex },
      ],
    });
  } else {
    const finalHashIndex = allocateIntermediate();
    steps.push({
      subcircuit: 'TransactionSignaturePoseidonBatch4',
      selector: null,
      inputs: [
        { kind: 'constant', index: chainModeConstantIndex },
        { kind: 'step-output', index: previousChallengeHashIndex },
        challengeInput(tailStart, contractOperandIndex, selectorOperandIndex),
        { kind: 'constant', index: zeroFieldConstantIndex },
        challengeInput(tailStart + 1, contractOperandIndex, selectorOperandIndex),
        challengeInput(tailStart + 2, contractOperandIndex, selectorOperandIndex),
        challengeInput(tailStart + 3, contractOperandIndex, selectorOperandIndex),
      ],
      outputs: [{ kind: 'discard' }, { kind: 'step-output', index: finalHashIndex }],
    });
    challengeHashIndex = finalHashIndex;
  }

  const runtimeTableIndices = allocateIntermediates(NUM_RUNTIME_TABLE_COORDINATES);
  const randomizerCofactorIndices = allocateIntermediates(NUM_EXTENDED_COORDINATES);
  steps.push({
    subcircuit: tailLength === 4
      ? 'TransactionSignaturePointPolicyWithHash'
      : 'TransactionSignaturePointPolicy',
    selector: null,
    inputs: [
      challengeInput(0, contractOperandIndex, selectorOperandIndex),
      challengeInput(1, contractOperandIndex, selectorOperandIndex),
      challengeInput(2, contractOperandIndex, selectorOperandIndex),
      challengeInput(3, contractOperandIndex, selectorOperandIndex),
      { kind: 'operand', index: contractOperandIndex },
      { kind: 'operand', index: selectorOperandIndex },
      { kind: 'operand', index: identityXOperandIndex },
      { kind: 'operand', index: identityYOperandIndex },
    ],
    outputs: [
      { kind: 'result', index: 1 },
      { kind: 'result', index: 0 },
      ...runtimeTableIndices.map((index): OutputReference => ({
        kind: 'step-output',
        index,
      })),
      ...randomizerCofactorIndices.map((index): OutputReference => ({
        kind: 'step-output',
        index,
      })),
      ...(tailLength === 4
        ? [{ kind: 'step-output', index: publicKeyHashIndex } satisfies OutputReference]
        : []),
    ],
  });

  const remainingResponseIndex = allocateIntermediate();
  const fixedAccumulatorIndices = allocateIntermediates(NUM_EXTENDED_COORDINATES);
  steps.push({
    subcircuit: 'TransactionSignatureFixedPrefix70',
    selector: null,
    inputs: [{ kind: 'operand', index: responseOperandIndex }],
    outputs: [
      { kind: 'step-output', index: remainingResponseIndex },
      ...fixedAccumulatorIndices.map((index): OutputReference => ({
        kind: 'step-output',
        index,
      })),
    ],
  });

  const challengeChunkIndices = allocateIntermediates(NUM_CHALLENGE_CHUNKS);
  steps.push({
    subcircuit: 'TransactionSignatureChallengeChunks',
    selector: null,
    inputs: [{ kind: 'step-output', index: challengeHashIndex }],
    outputs: challengeChunkIndices.map((index): OutputReference => ({
      kind: 'step-output',
      index,
    })),
  });

  let previousVariableAccumulatorIndices = allocateIntermediates(NUM_EXTENDED_COORDINATES);
  steps.push({
    subcircuit: 'TransactionSignatureVariableFirstBatch32',
    selector: null,
    inputs: [
      { kind: 'step-output', index: challengeChunkIndices[0]! },
      ...runtimeTableIndices.map((index): InputReference => ({
        kind: 'step-output',
        index,
      })),
    ],
    outputs: previousVariableAccumulatorIndices.map((index): OutputReference => ({
      kind: 'step-output',
      index,
    })),
  });

  for (const challengeChunkIndex of challengeChunkIndices.slice(1)) {
    const nextVariableAccumulatorIndices = allocateIntermediates(NUM_EXTENDED_COORDINATES);
    steps.push({
      subcircuit: 'TransactionSignatureVariableBatch32',
      selector: null,
      inputs: [
        { kind: 'step-output', index: challengeChunkIndex },
        ...runtimeTableIndices.map((index): InputReference => ({
          kind: 'step-output',
          index,
        })),
        ...previousVariableAccumulatorIndices.map((index): InputReference => ({
          kind: 'step-output',
          index,
        })),
      ],
      outputs: nextVariableAccumulatorIndices.map((index): OutputReference => ({
        kind: 'step-output',
        index,
      })),
    });
    previousVariableAccumulatorIndices = nextVariableAccumulatorIndices;
  }

  steps.push({
    subcircuit: 'TransactionSignatureFinal',
    selector: null,
    inputs: [
      { kind: 'step-output', index: remainingResponseIndex },
      ...fixedAccumulatorIndices.map((index): InputReference => ({
        kind: 'step-output',
        index,
      })),
      ...previousVariableAccumulatorIndices.map((index): InputReference => ({
        kind: 'step-output',
        index,
      })),
      ...randomizerCofactorIndices.map((index): InputReference => ({
        kind: 'step-output',
        index,
      })),
      { kind: 'step-output', index: publicKeyHashIndex },
    ],
    outputs: [{ kind: 'result', index: 2 }],
  });

  const constants: ConstantDefinition[] = [
    { value: 1n, dataPtType: BIT_DATA_PT_TYPE },
    { value: 0n, dataPtType: BLS12_381_FR_DATA_PT_TYPE },
  ];
  if (tailLength === 3) {
    constants.push({ value: 0n, dataPtType: BIT_DATA_PT_TYPE });
  }

  return {
    operation: 'TransactionSignatureVerify',
    composition: {
      placementStrategy: 'generic',
      constants,
      canonicalityGuardOperandIndices: [],
      numSteps: steps.length,
      numOperands: numberOfOperands,
      numResults: 3,
      steps,
    },
  };
};
