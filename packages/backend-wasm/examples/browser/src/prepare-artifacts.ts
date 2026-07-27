import {
  convertInstance,
  convertPermutation,
  convertProof,
  convertCrs,
  convertVerifierPreprocess,
  convertWitness,
} from "@tokamak-zk-evm/snark-browser-compat/converter";

export interface ArtifactSources {
  readonly witness: unknown;
  readonly permutation: unknown;
  readonly instance: unknown;
  readonly verifierPreprocess: unknown;
  readonly proof: unknown;
  readonly combinedSigmaRkyv: Uint8Array;
}

export async function prepareArtifacts(sources: ArtifactSources): Promise<{
  readonly witness: Uint8Array;
  readonly permutation: Uint8Array;
  readonly instance: Uint8Array;
  readonly verifierPreprocess: Uint8Array;
  readonly proof: Uint8Array;
  readonly proverCrs: Uint8Array;
  readonly preprocessCrs: Uint8Array;
  readonly verifierCrs: Uint8Array;
}> {
  const [witness, permutation, instance, verifierPreprocess, proof, crs] =
    await Promise.all([
      convertWitness(sources.witness),
      convertPermutation(sources.permutation),
      convertInstance(sources.instance),
      convertVerifierPreprocess(sources.verifierPreprocess),
      convertProof({ sourceFormat: "json", proof: sources.proof }),
      convertCrs(sources.combinedSigmaRkyv),
    ]);

  return {
    witness,
    permutation,
    instance,
    verifierPreprocess,
    proof,
    ...crs,
  };
}
