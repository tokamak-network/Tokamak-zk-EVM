import {
  createSynthesisOutputPayload,
  loadSynthesisInputFromUrls,
  synthesize,
} from '@tokamak-zk-evm/synthesizer-web';
import {
  convertInstance,
  convertPermutation,
  convertSelector,
  convertWitness,
} from '@tokamak-zk-evm/snark-browser-compat/converter';
import { install as installPreprocess, preprocess } from '@tokamak-zk-evm/snark-browser-compat/preprocess';
import { install as installProver, prove } from '@tokamak-zk-evm/snark-browser-compat/prover';
import { install as installVerifier, verify } from '@tokamak-zk-evm/snark-browser-compat/verifier';

declare global {
  interface Window {
    __tokamakReleaseE2eResult?: { status: 'pending' | 'ok' | 'error'; valid?: boolean; error?: string };
  }
}

window.__tokamakReleaseE2eResult = { status: 'pending' };

try {
  const input = await loadSynthesisInputFromUrls({
    previousState: '/inputs/previous_state_snapshot.json',
    transaction: '/inputs/transaction.json',
    blockInfo: '/inputs/block_info.json',
    contractCodes: '/inputs/contract_codes.json',
  });
  const output = createSynthesisOutputPayload(await synthesize(input));
  const witness = await convertWitness(output['placementVariables.json']);
  const selector = await convertSelector(output['selector.json']);
  const permutation = await convertPermutation(output['permutation.json']);
  const instance = await convertInstance(output['instance.json']);
  const manifestUrl = new URL('/crs/univariate-crs-manifest.json', location.href);
  const manifestResponse = await fetch(manifestUrl);
  if (!manifestResponse.ok) throw new Error(`CRS manifest: HTTP ${manifestResponse.status}`);
  const crs = {
    manifest: await manifestResponse.json() as unknown,
    async loadChunk(relativePath: string): Promise<Uint8Array> {
      const response = await fetch(new URL(relativePath, manifestUrl));
      if (!response.ok) throw new Error(`CRS chunk ${relativePath}: HTTP ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    },
  };

  await installPreprocess({ chunkSizeExponent: 17 });
  await installProver({ chunkSizeExponent: 18 });
  await installVerifier();
  const verifierPreprocess = await preprocess({ selector, permutation, preprocessCrs: crs });
  const proof = await prove({ witness, selector, permutation, instance, proverCrs: crs });
  const valid = await verify({ proof, instance, selector, permutation, verifierPreprocess, preprocessCrs: crs, verifierCrs: crs });
  if (!valid) throw new Error('The browser verifier rejected the proof.');
  window.__tokamakReleaseE2eResult = { status: 'ok', valid };
} catch (error) {
  window.__tokamakReleaseE2eResult = {
    status: 'error',
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  };
}
