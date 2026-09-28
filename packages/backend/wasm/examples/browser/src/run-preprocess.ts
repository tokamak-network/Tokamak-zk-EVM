import {
  install as installPreprocess,
  preprocess,
  type PreprocessInstallationInfo,
} from "@tokamak-zk-evm/snark-browser-compat/preprocess";

import { loadBinary } from "./load-binary.js";
import { loadCrs } from "./load-crs.js";

export interface PreprocessArtifactUrls {
  readonly selector: string | URL;
  readonly permutation: string | URL;
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
  const [selector, permutation, preprocessCrs] = await Promise.all([
    loadBinary(urls.selector),
    loadBinary(urls.permutation),
    loadCrs(urls.preprocessCrs),
  ]);
  return preprocess({ selector, permutation, preprocessCrs });
}
