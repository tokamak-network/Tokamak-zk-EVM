import { Synthesizer } from "./synthesizer.ts"
import { SynthesizerInterface, SynthesizerOpts } from "./types/index.ts"
import {
  installedSubcircuitLibrary,
} from '../interface/qapCompiler/installedLibrary.ts';
import type { ResolvedSubcircuitLibrary } from '../interface/qapCompiler/libraryTypes.ts';

export async function createSynthesizer(
  opts: SynthesizerOpts,
  subcircuitLibrary: ResolvedSubcircuitLibrary = installedSubcircuitLibrary,
): Promise<SynthesizerInterface> {
  const synthesizer = new Synthesizer(opts, subcircuitLibrary)
  return synthesizer
}
