import { OPERATOR_LIST, type CompositionSubcircuit, type Operator } from './configuredTypes.ts';
import { isDataPtType, type DataPtType } from '../synthesizer/types/dataStructure.ts';
import { createAddMulModCompositionMappings } from './special-builders/addMulModComposition.ts';
import { createDivisionCompositionMappings } from './special-builders/divModComposition.ts';
import { createExpCompositionMapping } from './special-builders/expComposition.ts';
import { createMemoryViewCompositionMapping } from './special-builders/memoryViewComposition.ts';
import { createPoseidonCompositionMapping } from './special-builders/poseidonComposition.ts';
import { createTransactionSignatureVerifyCompositionMapping } from './special-builders/txSignVerifyComposition.ts';

export type SelectorDefinition = bigint | null | 'dynamic';

type CompositionMaterializationStrategy = 'generic' | 'poseidon' | 'memory-view';

export type InputReference =
  | Readonly<{ kind: 'selector' }>
  | Readonly<{ kind: 'operand'; index: number }>
  | Readonly<{ kind: 'step-output'; index: number }>
  | Readonly<{ kind: 'constant'; index: number }>;

export type OutputReference =
  | Readonly<{ kind: 'step-output'; index: number; resultIndex?: number }>
  | Readonly<{ kind: 'result'; index: number | 'dynamic' }>
  | Readonly<{ kind: 'discard' }>;

export type CompositionStep = Readonly<{
  subcircuit: CompositionSubcircuit;
  selector: SelectorDefinition;
  inputs: readonly InputReference[];
  outputs: readonly OutputReference[];
}>;

export type ConstantDefinition = Readonly<{
  value: bigint;
  dataPtType: DataPtType;
}>;

export type PlacementComposition = Readonly<{
  placementStrategy: CompositionMaterializationStrategy;
  constants: readonly ConstantDefinition[];
  canonicalityGuardOperandIndices: readonly number[];
  numSteps: number | 'dynamic';
  numOperands: number | 'dynamic';
  numResults: number | 'dynamic';
  steps: readonly CompositionStep[];
}>;

export type PlacementCompositionEntry = Readonly<{
  operation: Operator;
  composition: PlacementComposition;
}>;

export type PlacementCompositionMapping = Readonly<Record<Operator, PlacementComposition>>;

const freezeReference = <Reference extends InputReference | OutputReference>(
  reference: Reference,
): Reference => Object.freeze({ ...reference }) as Reference;

const freezeComposition = (composition: PlacementComposition): PlacementComposition => Object.freeze({
  placementStrategy: composition.placementStrategy,
  constants: Object.freeze(composition.constants.map((constant) => Object.freeze({
    value: constant.value,
    dataPtType: constant.dataPtType,
  }))),
  canonicalityGuardOperandIndices: Object.freeze([
    ...composition.canonicalityGuardOperandIndices,
  ]),
  numSteps: composition.numSteps,
  numOperands: composition.numOperands,
  numResults: composition.numResults,
  steps: Object.freeze(composition.steps.map((step) => Object.freeze({
    subcircuit: step.subcircuit,
    selector: step.selector,
    inputs: Object.freeze(step.inputs.map(freezeReference)),
    outputs: Object.freeze(step.outputs.map(freezeReference)),
  }))),
});

export const assertPositiveInteger = (value: number, description: string): void => {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `PlacementCompositionMapping: ${description} must be a positive integer`,
    );
  }
};

const assertIndex = (index: number, description: string): void => {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`PlacementCompositionMapping: ${description} must be a non-negative integer`);
  }
};

const validatePlacementComposition = (operation: Operator, composition: PlacementComposition): void => {
  const hasDynamicSelector = composition.steps.some(({ selector }) => selector === 'dynamic');
  const isGeneric = composition.placementStrategy === 'generic';
  const expectedSpecialOperator = {
    poseidon: 'Poseidon',
    'memory-view': 'MemoryView',
  }[composition.placementStrategy as Exclude<CompositionMaterializationStrategy, 'generic'>];
  if (isGeneric && (composition.numSteps === 'dynamic' || hasDynamicSelector)) {
    throw new Error(
      `PlacementCompositionMapping: ${operation} cannot use generic placement with dynamic numSteps or selectors`,
    );
  }
  if (!isGeneric && expectedSpecialOperator !== operation) {
    throw new Error(
      `PlacementCompositionMapping: ${operation} has an invalid ${composition.placementStrategy} placement strategy`,
    );
  }
  if (isGeneric && composition.numOperands === 'dynamic') {
    throw new Error(`PlacementCompositionMapping: ${operation} generic placement requires a fixed operand count`);
  }
  if (!isGeneric && composition.numOperands !== 'dynamic') {
    throw new Error(`PlacementCompositionMapping: ${operation} special placement requires a dynamic operand count`);
  }
  if (composition.numSteps !== 'dynamic') {
    assertIndex(composition.numSteps, `${operation} numSteps`);
    if (composition.numSteps !== composition.steps.length) {
      throw new Error(`PlacementCompositionMapping: ${operation} numSteps must match its step count`);
    }
  }
  if (composition.numResults === 'dynamic') {
    if (composition.placementStrategy !== 'memory-view') {
      throw new Error(`PlacementCompositionMapping: ${operation} dynamic results require memory-view placement`);
    }
  } else {
    assertIndex(composition.numResults, `${operation} numResults`);
  }
  if (composition.steps.length === 0) {
    throw new Error(`PlacementCompositionMapping: operation ${operation} requires at least one step`);
  }
  if (composition.numOperands === 'dynamic' && composition.canonicalityGuardOperandIndices.length > 0) {
    throw new Error(
      `PlacementCompositionMapping: ${operation} dynamic operands cannot declare external input checks`,
    );
  }
  const externalCheckOperandIndices = new Set<number>();
  for (const index of composition.canonicalityGuardOperandIndices) {
    assertIndex(index, `${operation} external-check operand index`);
    if (externalCheckOperandIndices.has(index)) {
      throw new Error(
        `PlacementCompositionMapping: ${operation} has a duplicate external-check operand index`,
      );
    }
    externalCheckOperandIndices.add(index);
    if (composition.numOperands !== 'dynamic' && index >= composition.numOperands) {
      throw new Error(
        `PlacementCompositionMapping: ${operation} external-check operand index is out of range`,
      );
    }
  }

  const intermediates = new Set<number>();
  const consumedIntermediates = new Set<number>();
  const consumedConstants = new Set<number>();
  const results = new Set<number>();
  let dynamicResultCount = 0;
  let highestOperandIndex = -1;

  for (const [constantIndex, constant] of composition.constants.entries()) {
    if (!isDataPtType(constant.dataPtType)) {
      throw new Error(
        `PlacementCompositionMapping: ${operation} constant ${constantIndex} has an invalid canonical DataPt type`,
      );
    }
  }

  for (const [stepIndex, step] of composition.steps.entries()) {
    const selectorInputs = step.inputs.filter(({ kind }) => kind === 'selector').length;
    if (selectorInputs !== (step.selector === null ? 0 : 1)) {
      throw new Error(
        `PlacementCompositionMapping: ${operation} step ${stepIndex} selector input does not match its selector definition`,
      );
    }

    for (const input of step.inputs) {
      if (input.kind === 'operand') {
        assertIndex(input.index, `${operation} step ${stepIndex} operand index`);
        highestOperandIndex = Math.max(highestOperandIndex, input.index);
      } else if (input.kind === 'step-output') {
        assertIndex(input.index, `${operation} step ${stepIndex} intermediate input index`);
        if (!intermediates.has(input.index)) {
          throw new Error(
            `PlacementCompositionMapping: ${operation} step ${stepIndex} references an intermediate before it is produced`,
          );
        }
        consumedIntermediates.add(input.index);
      } else if (input.kind === 'constant') {
        assertIndex(input.index, `${operation} step ${stepIndex} constant index`);
        if (input.index >= composition.constants.length) {
          throw new Error(`PlacementCompositionMapping: ${operation} step ${stepIndex} constant index is out of range`);
        }
        consumedConstants.add(input.index);
      }
    }

    for (const output of step.outputs) {
      if (output.kind === 'step-output') {
        assertIndex(output.index, `${operation} step ${stepIndex} intermediate output index`);
        if (intermediates.has(output.index)) {
          throw new Error(
            `PlacementCompositionMapping: ${operation} intermediate ${output.index} has multiple producers`,
          );
        }
        intermediates.add(output.index);
        if (output.resultIndex !== undefined) {
          assertIndex(output.resultIndex, `${operation} step ${stepIndex} result index`);
          if (composition.numResults === 'dynamic') {
            throw new Error(
              `PlacementCompositionMapping: ${operation} must use dynamic result routing`,
            );
          }
          if (output.resultIndex >= composition.numResults) {
            throw new Error(`PlacementCompositionMapping: ${operation} step ${stepIndex} result index is out of range`);
          }
          if (results.has(output.resultIndex)) {
            throw new Error(`PlacementCompositionMapping: ${operation} result ${output.resultIndex} has multiple producers`);
          }
          results.add(output.resultIndex);
        }
      } else if (output.kind === 'result') {
        if (output.index === 'dynamic') {
          if (composition.placementStrategy !== 'memory-view') {
            throw new Error(
              `PlacementCompositionMapping: ${operation} dynamic result routing requires memory-view placement`,
            );
          }
          dynamicResultCount++;
          continue;
        }
        assertIndex(output.index, `${operation} step ${stepIndex} result index`);
        if (composition.numResults === 'dynamic') {
          throw new Error(
            `PlacementCompositionMapping: ${operation} must use dynamic result routing`,
          );
        }
        if (output.index >= composition.numResults) {
          throw new Error(`PlacementCompositionMapping: ${operation} step ${stepIndex} result index is out of range`);
        }
        if (results.has(output.index)) {
          throw new Error(`PlacementCompositionMapping: ${operation} result ${output.index} has multiple producers`);
        }
        results.add(output.index);
      }
    }
  }

  if (isGeneric && composition.numOperands !== highestOperandIndex + 1) {
    throw new Error(
      `PlacementCompositionMapping: ${operation} generic operand count must match its operand references`,
    );
  }

  for (const [constantIndex] of composition.constants.entries()) {
    if (!consumedConstants.has(constantIndex)) {
      throw new Error(`PlacementCompositionMapping: ${operation} constant ${constantIndex} is never used`);
    }
  }

  for (let index = 0; index < intermediates.size; index++) {
    if (!intermediates.has(index)) {
      throw new Error(`PlacementCompositionMapping: ${operation} intermediate indices must be contiguous`);
    }
    if (!consumedIntermediates.has(index)) {
      throw new Error(`PlacementCompositionMapping: ${operation} intermediate ${index} is never consumed`);
    }
  }

  if (composition.numResults !== 'dynamic') {
    for (let index = 0; index < composition.numResults; index++) {
      if (!results.has(index)) {
        throw new Error(`PlacementCompositionMapping: ${operation} result ${index} is not produced`);
      }
    }
  } else if (dynamicResultCount !== 1) {
    throw new Error(
      `PlacementCompositionMapping: ${operation} requires exactly one dynamic result route`,
    );
  }
};

const assemblePlacementCompositionMapping = (
  entries: readonly PlacementCompositionEntry[],
): PlacementCompositionMapping => {
  const compositions = new Map<Operator, PlacementComposition>();

  for (const { operation, composition: sourceComposition } of entries) {
    if (!(OPERATOR_LIST as readonly string[]).includes(operation)) {
      throw new Error(`PlacementCompositionMapping: operation ${operation} is not configured`);
    }
    if (compositions.has(operation)) {
      throw new Error(`PlacementCompositionMapping: operation ${operation} has multiple mappings`);
    }

    const composition = freezeComposition(sourceComposition);
    validatePlacementComposition(operation, composition);
    compositions.set(operation, composition);
  }

  const mapping = {} as Record<Operator, PlacementComposition>;
  for (const operation of OPERATOR_LIST) {
    const composition = compositions.get(operation);
    if (composition === undefined) {
      throw new Error(`PlacementCompositionMapping: operation ${operation} has no mapping`);
    }
    mapping[operation] = composition;
  }

  return Object.freeze(mapping);
};

const createSingleStepMapping = (
  operation: Operator,
  subcircuit: CompositionSubcircuit,
  selector: SelectorDefinition,
  numOperands: number,
  numResults: number,
  constants: readonly ConstantDefinition[] = [],
  canonicalityGuardOperandIndices: readonly number[] = [],
): PlacementCompositionEntry =>
  ({
    operation,
    composition: {
      placementStrategy: 'generic',
      constants,
      canonicalityGuardOperandIndices,
      numSteps: 1,
      numOperands,
      numResults,
      steps: [
        {
          subcircuit,
          selector,
          inputs: [
            ...(selector === null ? [] : [{ kind: 'selector' } as const]),
            ...Array.from({ length: numOperands }, (_, index): InputReference => ({ kind: 'operand', index })),
            ...constants.map((_, index): InputReference => ({ kind: 'constant', index })),
          ],
          outputs: Array.from({ length: numResults }, (_, index): OutputReference => ({ kind: 'result', index })),
        },
      ],
    },
  });

const FIXED_SINGLE_STEP_ARITHMETIC_MAPPINGS: readonly PlacementCompositionEntry[] = [
  createSingleStepMapping('ADD', 'ADD', null, 2, 1, [], [0, 1]),
  createSingleStepMapping('MUL', 'MUL', null, 2, 1),
  createSingleStepMapping('SUB', 'SUB', null, 2, 1, [], [0, 1]),
  createSingleStepMapping('LT', 'LT', null, 2, 1, [], [0, 1]),
  createSingleStepMapping('GT', 'GT', null, 2, 1, [], [0, 1]),
  createSingleStepMapping('SLT', 'SLT', null, 2, 1, [], [0, 1]),
  createSingleStepMapping('SGT', 'SGT', null, 2, 1, [], [0, 1]),
  createSingleStepMapping('EQ', 'EQ', null, 2, 1),
  createSingleStepMapping('ISZERO', 'ISZERO', null, 1, 1),
  createSingleStepMapping('AND', 'AND', null, 2, 1),
  createSingleStepMapping('OR', 'OR', null, 2, 1),
  createSingleStepMapping('XOR', 'XOR', null, 2, 1),
  createSingleStepMapping('NOT', 'NOT', null, 1, 1),
  createSingleStepMapping('BYTE', 'ALU3', 1n << 1n, 2, 1, [], [0]),
  createSingleStepMapping('SHL', 'SHL', null, 2, 1, [], [0]),
  createSingleStepMapping('SHR', 'SHR', null, 2, 1, [], [0]),
  createSingleStepMapping('SAR', 'ALU3', 1n << 2n, 2, 1, [], [0]),
  createSingleStepMapping('SIGNEXTEND', 'ALU3', 1n << 0n, 2, 1, [], [0]),
];

const createSelectorFreeCompositionMappings = (): readonly PlacementCompositionEntry[] =>
  [
    createSingleStepMapping('StorageAccess', 'StorageAccess', null, 4, 0),
    createSingleStepMapping('FrToLimbsPair', 'FrToLimbsPair', null, 2, 2),
  ];

export type PlacementCompositionConfig = Readonly<{
  nPrivateMessageInputs: number;
  nPoseidonBatch: number;
}>;

export const createPlacementCompositionMapping = (
  config: PlacementCompositionConfig,
): PlacementCompositionMapping => {
  if (!Number.isSafeInteger(config.nPrivateMessageInputs) || config.nPrivateMessageInputs < 0) {
    throw new Error('PlacementCompositionMapping: nPrivateMessageInputs must be a non-negative safe integer');
  }
  return assemblePlacementCompositionMapping([
    ...FIXED_SINGLE_STEP_ARITHMETIC_MAPPINGS,
    ...createDivisionCompositionMappings(),
    ...createAddMulModCompositionMappings(),
    ...createSelectorFreeCompositionMappings(),
    createExpCompositionMapping(),
    createMemoryViewCompositionMapping(),
    createPoseidonCompositionMapping(config),
    createTransactionSignatureVerifyCompositionMapping(config.nPrivateMessageInputs),
  ]);
};
