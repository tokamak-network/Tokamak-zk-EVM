import { addHexPrefix } from '@ethereumjs/util';
import { SynthesizerInterface } from '../synthesizer/types/index.ts';
import type { PlacementVariables } from '../synthesizer/types/placements.ts';
import {
  VariableGenerator,
} from './generators/variableGenerator.ts';
import { derivePlacementSelector } from './generators/placementSelector.ts';
import { PermutationGenerator } from './generators/permutationGenerator.ts';
import {
  CircuitGenerationResult,
  PublicInstance,
  PublicInstanceDescription,
} from './types/types.ts';

export const extractPublicProjection = (
  placementVariables: PlacementVariables,
  synthesizer: SynthesizerInterface,
): Readonly<{
  publicInstance: PublicInstance;
  publicInstanceDescription: PublicInstanceDescription;
}> => {
  const { setupParams, subcircuitInfo } = synthesizer.subcircuitLibrary.data;
  const infoById = new Map(subcircuitInfo.map(info => [info.id, info]));
  const phaseValues = new Map<string, `0x${string}`[]>();
  const phaseDescriptions = new Map<string, string[]>();
  for (const phase of setupParams.publicWirePhases) {
    if (phaseValues.has(phase.name)) throw new Error(`Public phase ${phase.name} is duplicated`);
    const values: `0x${string}`[] = [];
    const descriptions: string[] = [];
    for (const subcircuitId of phase.subcircuitIds) {
      const info = infoById.get(subcircuitId);
      if (info === undefined || info.publicPhase !== phase.name || info.Public_idx[1] === 0) {
        throw new Error(`Public phase ${phase.name} has invalid subcircuit ${subcircuitId}`);
      }
      const placements = placementVariables.filter(entry => entry.subcircuitId === subcircuitId);
      if (placements.length !== 1) {
        throw new Error(`Public subcircuit ${subcircuitId} must have exactly one runtime placement`);
      }
      const placement = placements[0]!;
      const [start, count] = info.Public_idx;
      for (let localWire = start; localWire < start + count; localWire++) {
        const value = placement.variables[localWire];
        const description = placement.instanceList[localWire];
        if (value === undefined || description === undefined) {
          throw new Error('Public wire metadata does not resolve to a placement variable');
        }
        values.push(addHexPrefix(value));
        descriptions.push(description);
      }
    }
    phaseValues.set(phase.name, values);
    phaseDescriptions.set(phase.name, descriptions);
  }
  const requiredPhaseNames = ['user-output', 'user-input', 'block-input', 'function-input'] as const;
  if (
    phaseValues.size !== requiredPhaseNames.length
    || requiredPhaseNames.some(name => !phaseValues.has(name))
  ) {
    throw new Error('Public phase metadata does not match the synthesizer output contract');
  }
  const valuesFor = (name: typeof requiredPhaseNames[number]) => phaseValues.get(name)!;
  const descriptionsFor = (name: typeof requiredPhaseNames[number]) => phaseDescriptions.get(name)!;
  const freePublicCount = setupParams.publicWirePhases
    .filter(phase => phase.region === 'free')
    .reduce(
      (count, phase) =>
        count + valuesFor(phase.name as typeof requiredPhaseNames[number]).length,
      0,
    );
  const freePublicCapacity = 2 ** Math.ceil(Math.log2(Math.max(1, freePublicCount)));
  const freePublicPadding = freePublicCapacity - freePublicCount;
  return {
    publicInstance: {
      a_pub_user: [...valuesFor('user-output'), ...valuesFor('user-input')],
      a_pub_block: [
        ...valuesFor('block-input'),
        ...Array<`0x${string}`>(freePublicPadding).fill('0x00'),
      ],
      a_pub_function: valuesFor('function-input'),
    },
    publicInstanceDescription: {
      a_pub_user_description: [
        ...descriptionsFor('user-output'),
        ...descriptionsFor('user-input'),
      ],
      a_pub_block_description: [
        ...descriptionsFor('block-input'),
        ...Array<string>(freePublicPadding).fill(''),
      ],
      a_pub_function_description: descriptionsFor('function-input'),
    },
  };
};

export async function createCircuitGenerator(synthesizer: SynthesizerInterface): Promise<CircuitGenerationResult> {
  const variableGeneration = await new VariableGenerator(
    synthesizer,
    synthesizer.subcircuitLibrary,
  ).generate();
  const publicProjection = extractPublicProjection(
    variableGeneration.placementVariables,
    synthesizer,
  );
  const permutation = new PermutationGenerator(
    variableGeneration.circuitPlacements,
    variableGeneration.placementVariables,
    synthesizer.subcircuitLibrary,
  ).permutation;
  const selector = derivePlacementSelector(
    variableGeneration.circuitPlacements,
    variableGeneration.placementVariables,
    synthesizer.subcircuitLibrary,
  );
  return {
    placements: variableGeneration.circuitPlacements,
    placementVariables: variableGeneration.placementVariables,
    selector,
    ...publicProjection,
    permutation,
  };
}
