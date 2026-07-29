import {
  install as installVerifier,
  verify,
  type VerifierInstallationInfo,
} from "@tokamak-zk-evm/snark-browser-compat/verifier";

import { loadBinary } from "./load-binary.js";

export interface VerifierArtifactUrls {
  readonly proof: string | URL;
  readonly instance: string | URL;
  readonly verifierPreprocess: string | URL;
}

export function installVerifierRuntime(): Promise<VerifierInstallationInfo> {
  return installVerifier();
}

export async function verifyProof(
  urls: VerifierArtifactUrls,
  generated: {
    readonly proof?: Uint8Array;
    readonly verifierPreprocess?: Uint8Array;
  } = {},
): Promise<boolean> {
  const [proof, instance, verifierPreprocess] = await Promise.all([
    generated.proof ?? loadBinary(urls.proof),
    loadBinary(urls.instance),
    generated.verifierPreprocess ?? loadBinary(urls.verifierPreprocess),
  ]);
  return verify({ proof, instance, verifierPreprocess });
}
