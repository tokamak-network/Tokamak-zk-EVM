import {
  install as installPreprocess,
  preprocess,
  type PreprocessInstallationInfo,
} from "@tokamak-zk-evm/snark-browser-compat/preprocess";

import { loadBinary } from "./load-binary.js";

export interface PreprocessArtifactUrls {
  readonly permutation: string | URL;
  readonly instance: string | URL;
  readonly preprocessCrs: string | URL;
}

export function installPreprocessRuntime(
  chunkSizeExponent = 17,
): Promise<PreprocessInstallationInfo> {
  return installPreprocess({ chunkSizeExponent });
}

export async function generateVerifierPreprocess(
  urls: PreprocessArtifactUrls,
): Promise<Uint8Array> {
  const [permutation, instance, preprocessCrs] = await Promise.all([
    loadBinary(urls.permutation),
    loadBinary(urls.instance),
    loadBinary(urls.preprocessCrs),
  ]);
  return preprocess({ permutation, instance, preprocessCrs });
}
