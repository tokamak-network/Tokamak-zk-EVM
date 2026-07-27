import {
  install as installVerifier,
  verify,
} from "@tokamak-zk-evm/backend-wasm/verifier";

import { loadBinary } from "./load-binary.js";

export interface VerifierArtifactUrls {
  readonly proof: string | URL;
  readonly instance: string | URL;
  readonly verifierPreprocess: string | URL;
}

export async function verifyProof(urls: VerifierArtifactUrls): Promise<boolean> {
  await installVerifier();
  const [proof, instance, verifierPreprocess] = await Promise.all([
    loadBinary(urls.proof),
    loadBinary(urls.instance),
    loadBinary(urls.verifierPreprocess),
  ]);
  return verify({ proof, instance, verifierPreprocess });
}
