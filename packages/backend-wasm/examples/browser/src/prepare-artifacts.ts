import {
  convertInstance,
  convertPermutation,
  convertProof,
  convertProverCrs,
  convertVerifierPreprocess,
  convertWitness,
} from "@tokamak-zk-evm/backend-wasm/converter";

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
}> {
  const [witness, permutation, instance, verifierPreprocess, proof, proverCrs] =
    await Promise.all([
      convertWitness(sources.witness),
      convertPermutation(sources.permutation),
      convertInstance(sources.instance),
      convertVerifierPreprocess(sources.verifierPreprocess),
      convertProof({ sourceFormat: "json", proof: sources.proof }),
      convertProverCrs(sources.combinedSigmaRkyv),
    ]);

  return { witness, permutation, instance, verifierPreprocess, proof, proverCrs };
}
