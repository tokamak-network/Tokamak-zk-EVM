import { Synthesizer } from "./synthesizer.ts"
import { SynthesizerInterface, SynthesizerOpts } from "./types/index.ts"
import {
  installedSubcircuitLibrary,
} from '../interface/qapCompiler/index.ts';
import type { ResolvedSubcircuitLibrary } from '../interface/qapCompiler/types.ts';

export async function createSynthesizer(
  opts: SynthesizerOpts,
  subcircuitLibrary: ResolvedSubcircuitLibrary = installedSubcircuitLibrary,
): Promise<SynthesizerInterface> {
  const synthesizer = new Synthesizer(opts, subcircuitLibrary)
  return synthesizer
}
