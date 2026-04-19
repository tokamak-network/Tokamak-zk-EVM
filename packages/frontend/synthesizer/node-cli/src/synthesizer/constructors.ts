import {
  createSynthesizer as createCoreSynthesizer,
  type SynthesizerInterface,
  type SynthesizerOpts,
} from '../../../core/src/synthesizer.ts';
import type { ResolvedSubcircuitLibrary } from '../../../core/src/qapCompiler.ts';
import { installedSubcircuitLibrary } from '../subcircuit/installedLibrary.ts';

export async function createSynthesizer(
  opts: SynthesizerOpts,
  subcircuitLibrary: ResolvedSubcircuitLibrary = installedSubcircuitLibrary,
): Promise<SynthesizerInterface> {
  return createCoreSynthesizer(opts, subcircuitLibrary)
}
