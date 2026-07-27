import {
  install as installProver,
  prove,
} from "@tokamak-zk-evm/snark-browser-compat/prover";

import { loadBinary } from "./load-binary.js";

export interface ProverArtifactUrls {
  readonly witness: string | URL;
  readonly permutation: string | URL;
  readonly instance: string | URL;
  readonly proverCrs: string | URL;
}

export async function generateProof(
  urls: ProverArtifactUrls,
  chunkSizeExponent = 18,
): Promise<Uint8Array> {
  await installProver({ chunkSizeExponent });
  const [witness, permutation, instance, proverCrs] = await Promise.all([
    loadBinary(urls.witness),
    loadBinary(urls.permutation),
    loadBinary(urls.instance),
    loadBinary(urls.proverCrs),
  ]);
  return prove({ witness, permutation, instance, proverCrs });
}
