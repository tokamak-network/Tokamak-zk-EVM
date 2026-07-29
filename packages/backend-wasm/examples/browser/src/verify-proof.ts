import {
  install as installVerifier,
  verify,
  type VerifierInstallationInfo,
} from "@tokamak-zk-evm/snark-browser-compat/verifier";

import { loadBinary } from "./load-binary.js";

export interface VerifierExampleInput {
  readonly proof: Uint8Array;
  readonly instance: string | URL;
  readonly verifierPreprocess: Uint8Array;
}

export function installVerifierRuntime(): Promise<VerifierInstallationInfo> {
  return installVerifier();
}

export async function verifyProof(input: VerifierExampleInput): Promise<boolean> {
  const instance = await loadBinary(input.instance);
  return verify({
    proof: input.proof,
    instance,
    verifierPreprocess: input.verifierPreprocess,
  });
}
