import {
  synthesizeFromSnapshotInput,
  type SynthesisPayloadInput,
  type SynthesisOutput,
} from '../../core/src/app.ts';
import { prepareSynthesisInput } from './subcircuit/index.ts';

export async function synthesize(input: SynthesisPayloadInput): Promise<SynthesisOutput> {
  return synthesizeFromSnapshotInput(await prepareSynthesisInput(input));
}
