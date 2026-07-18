import type { SynthesisOutput } from './types.ts';

export type SynthesisOutputArtifactKind = 'primary' | 'supplement';

export interface SynthesisOutputSelectionOptions {
  readonly outputSupplement?: boolean;
}

interface SynthesisOutputArtifactDefinition {
  readonly path: string;
  readonly kind: SynthesisOutputArtifactKind;
  readonly serialize: (output: SynthesisOutput) => string;
}

const bigintJsonReplacer = (_key: string, value: unknown) =>
  typeof value === 'bigint' ? value.toString() : value;

const synthesisOutputArtifactDefinitions: readonly SynthesisOutputArtifactDefinition[] = [
  {
    path: 'placementVariables.json',
    kind: 'primary',
    serialize: (output) => JSON.stringify(output.placementVariables, null, 2),
  },
  {
    path: 'instance.json',
    kind: 'primary',
    serialize: (output) => JSON.stringify(output.publicInstance, null, 2),
  },
  {
    path: 'instance_description.json',
    kind: 'primary',
    serialize: (output) => JSON.stringify(output.publicInstanceDescription, null, 2),
  },
  {
    path: 'permutation.json',
    kind: 'primary',
    serialize: (output) => JSON.stringify(output.permutation, null, 2),
  },
  {
    path: 'state_snapshot.json',
    kind: 'primary',
    serialize: (output) => JSON.stringify(output.finalStateSnapshot, bigintJsonReplacer, 2),
  },
  {
    path: 'supplement/step_log.json',
    kind: 'supplement',
    serialize: (output) => JSON.stringify(output.evmAnalysis.stepLogs, null, 2),
  },
  {
    path: 'supplement/placements.json',
    kind: 'supplement',
    serialize: (output) => JSON.stringify(output.placements, bigintJsonReplacer, 2),
  },
  {
    path: 'supplement/message_code_addresses.json',
    kind: 'supplement',
    serialize: (output) => JSON.stringify(output.evmAnalysis.messageCodeAddresses, null, 2),
  },
];

function shouldIncludeArtifact(
  artifact: SynthesisOutputArtifactDefinition,
  options?: SynthesisOutputSelectionOptions,
): boolean {
  return artifact.kind === 'primary' || options?.outputSupplement === true;
}

export function getSynthesisOutputArtifactDefinitions():
  readonly Pick<SynthesisOutputArtifactDefinition, 'path' | 'kind'>[] {
  return synthesisOutputArtifactDefinitions.map(({ path, kind }) => ({ path, kind }));
}

export function createSynthesisOutputJsonFiles(
  output: SynthesisOutput,
  options: SynthesisOutputSelectionOptions = {},
): Record<string, string> {
  return Object.fromEntries(
    synthesisOutputArtifactDefinitions
      .filter((artifact) => shouldIncludeArtifact(artifact, options))
      .map((artifact) => [artifact.path, artifact.serialize(output)]),
  );
}
