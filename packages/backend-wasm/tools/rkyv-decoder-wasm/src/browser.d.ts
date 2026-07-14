export interface CombinedSigmaPayloadDecoder {
  decodeCombinedSigmaPayload(input: Uint8Array): Promise<Uint8Array>;
}

export interface RkyvDecoderWasmOptions {
  wasmUrl?: string | URL;
}

export function loadCombinedSigmaPayloadDecoder(
  options?: RkyvDecoderWasmOptions,
): Promise<CombinedSigmaPayloadDecoder>;
