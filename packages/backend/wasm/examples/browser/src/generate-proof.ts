import {
  install as installProver,
  prove,
  type ProverInstallationInfo,
} from "@tokamak-zk-evm/snark-browser-compat/prover";

import { loadBinary } from "./load-binary.js";
import { loadCrs } from "./load-crs.js";

export interface ProverArtifactUrls {
  readonly witness: string | URL;
  readonly selector: string | URL;
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
  const [witness, selector, permutation, instance, proverCrs] = await Promise.all([
    loadBinary(urls.witness),
    loadBinary(urls.selector),
    loadBinary(urls.permutation),
    loadBinary(urls.instance),
    loadCrs(urls.proverCrs),
  ]);
  return prove({ witness, selector, permutation, instance, proverCrs });
}
