export function decodeCombinedSigma(input: Uint8Array): Uint8Array;

export default function initRkyvDecoder(
  moduleOrPath?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module,
): Promise<{ readonly memory: WebAssembly.Memory }>;
