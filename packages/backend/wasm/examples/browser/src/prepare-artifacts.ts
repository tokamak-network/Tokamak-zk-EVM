import {
  convertInstance,
  convertPermutation,
  convertSelector,
  convertWitness,
} from "@tokamak-zk-evm/snark-browser-compat/converter";
import type { UnivariateCrsChunkInput } from "@tokamak-zk-evm/snark-browser-compat/prover";

export interface ArtifactSources {
  readonly witness: unknown;
  readonly selector: unknown;
  readonly permutation: unknown;
  readonly instance: unknown;
  readonly univariateCrs: UnivariateCrsChunkInput;
}

export async function prepareArtifacts(sources: ArtifactSources): Promise<{
  readonly witness: Uint8Array;
  readonly selector: Uint8Array;
  readonly permutation: Uint8Array;
  readonly instance: Uint8Array;
  readonly proverCrs: UnivariateCrsChunkInput;
  readonly preprocessCrs: UnivariateCrsChunkInput;
  readonly verifierCrs: UnivariateCrsChunkInput;
}> {
  const [witness, selector, permutation, instance] =
    await Promise.all([
      convertWitness(sources.witness),
      convertSelector(sources.selector),
      convertPermutation(sources.permutation),
      convertInstance(sources.instance),
    ]);

  return {
    witness,
    selector,
    permutation,
    instance,
    proverCrs: sources.univariateCrs,
    preprocessCrs: sources.univariateCrs,
    verifierCrs: sources.univariateCrs,
  };
}
