export function decodeCombinedSigma(input: Uint8Array): Uint8Array;

export interface RkyvDecoderInitOutput {
  readonly memory: WebAssembly.Memory;
}

export default function initRkyvDecoder(
  moduleOrPath?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module,
): Promise<RkyvDecoderInitOutput>;
