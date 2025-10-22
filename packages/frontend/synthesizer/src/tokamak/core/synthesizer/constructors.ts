import { SynthesizerOpts } from "src/tokamak/types/synthesizer.ts"
import { Synthesizer } from "./synthesizer.ts"
import { SynthesizerInterface } from "./types.ts"

export async function createSynthesizer(opts: SynthesizerOpts): Promise<SynthesizerInterface> {
  const synthesizer = new Synthesizer(opts)
  await synthesizer.initBuffers()
  return synthesizer
}