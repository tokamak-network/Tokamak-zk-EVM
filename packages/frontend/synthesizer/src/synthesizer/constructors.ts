import { Synthesizer } from "./synthesizer.ts"
import { SynthesizerInterface, SynthesizerOpts } from "./types/index.ts"

export async function createSynthesizer(opts: SynthesizerOpts): Promise<SynthesizerInterface> {
  const synthesizer = new Synthesizer(opts)
  return synthesizer
}