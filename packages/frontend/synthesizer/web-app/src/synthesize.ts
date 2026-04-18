import {
  synthesizeFromSnapshotInput,
  type SynthesisInput,
  type SynthesisOutput,
} from '../../core/src/index.ts';

export async function synthesize(input: SynthesisInput): Promise<SynthesisOutput> {
  return synthesizeFromSnapshotInput(input);
}
