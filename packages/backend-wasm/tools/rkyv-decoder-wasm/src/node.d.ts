export interface CombinedSigmaPayloadDecoder {
  decodeCombinedSigmaPayload(input: Uint8Array): Promise<Uint8Array>;
}

export function loadCombinedSigmaPayloadDecoder(): Promise<CombinedSigmaPayloadDecoder>;
