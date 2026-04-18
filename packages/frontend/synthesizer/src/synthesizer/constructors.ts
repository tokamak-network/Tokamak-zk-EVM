import {
  createSynthesizer as createCoreSynthesizer,
  type ResolvedSubcircuitLibrary,
  type SynthesizerInterface,
  type SynthesizerOpts,
} from '@tokamak-zk-evm/synthesizer-core';
import { installedSubcircuitLibrary } from '../interface/qapCompiler/installedLibrary.ts';

export async function createSynthesizer(
  opts: SynthesizerOpts,
  subcircuitLibrary: ResolvedSubcircuitLibrary = installedSubcircuitLibrary,
): Promise<SynthesizerInterface> {
  return createCoreSynthesizer(opts, subcircuitLibrary)
}
