import type { UnivariateCrsChunkInput } from "@tokamak-zk-evm/snark-browser-compat/prover";

export async function loadCrs(manifestLocation: string | URL): Promise<UnivariateCrsChunkInput> {
  const manifestUrl = new URL(manifestLocation, window.location.href);
  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error(`Failed to load CRS manifest: ${response.status} ${response.statusText}.`);
  return {
    manifest: await response.json() as unknown,
    async loadChunk(relativePath) {
      const chunkResponse = await fetch(new URL(relativePath, manifestUrl));
      if (!chunkResponse.ok) {
        throw new Error(`Failed to load CRS chunk '${relativePath}': ${chunkResponse.status} ${chunkResponse.statusText}.`);
      }
      return new Uint8Array(await chunkResponse.arrayBuffer());
    },
  };
}
