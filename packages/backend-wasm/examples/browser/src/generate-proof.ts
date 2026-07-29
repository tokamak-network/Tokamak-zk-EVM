import {
  install as installProver,
  prove,
  type ProverInstallationInfo,
} from "@tokamak-zk-evm/snark-browser-compat/prover";

import { loadBinary } from "./load-binary.js";

export interface ProverArtifactUrls {
  readonly witness: string | URL;
  readonly permutation: string | URL;
  readonly instance: string | URL;
  readonly proverCrs: string | URL;
}

export function installProverRuntime(
  chunkSizeExponent = 18,
): Promise<ProverInstallationInfo> {
  return installProver({ chunkSizeExponent });
}

export async function generateProof(
  urls: ProverArtifactUrls,
): Promise<Uint8Array> {
  const [witness, permutation, instance, proverCrs] = await Promise.all([
    loadBinary(urls.witness),
    loadBinary(urls.permutation),
    loadBinary(urls.instance),
    loadBinary(urls.proverCrs),
  ]);
  return prove({ witness, permutation, instance, proverCrs });
}
