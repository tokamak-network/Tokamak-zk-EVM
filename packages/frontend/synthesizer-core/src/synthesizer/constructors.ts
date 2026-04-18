import { Synthesizer } from "./synthesizer.ts"
import { SynthesizerInterface, SynthesizerOpts } from "./types/index.ts"
import type { ResolvedSubcircuitLibrary } from '../interface/qapCompiler/libraryTypes.ts';

export async function createSynthesizer(
  opts: SynthesizerOpts,
  subcircuitLibrary: ResolvedSubcircuitLibrary,
): Promise<SynthesizerInterface> {
  const synthesizer = new Synthesizer(opts, subcircuitLibrary)
  return synthesizer
}
