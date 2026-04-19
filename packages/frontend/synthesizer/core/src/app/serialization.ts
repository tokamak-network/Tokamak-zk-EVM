import type { SynthesisOutput } from './types.ts';

const bigintJsonReplacer = (_key: string, value: unknown) =>
  typeof value === 'bigint' ? value.toString() : value;

export function createSynthesisOutputJsonFiles(
  output: SynthesisOutput,
): Record<string, string> {
  return {
    'placementVariables.json': JSON.stringify(output.placementVariables, null, 2),
    'instance.json': JSON.stringify(output.publicInstance, null, 2),
    'instance_description.json': JSON.stringify(output.publicInstanceDescription, null, 2),
    'permutation.json': JSON.stringify(output.permutation, null, 2),
    'state_snapshot.json': JSON.stringify(output.finalStateSnapshot, bigintJsonReplacer, 2),
    'step_log.json': JSON.stringify(output.evmAnalysis.stepLogs, null, 2),
    'message_code_addresses.json': JSON.stringify(output.evmAnalysis.messageCodeAddresses, null, 2),
  };
}
