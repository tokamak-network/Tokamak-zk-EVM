import type { ProofData } from "../types/proof.js";

export interface ProofCodec {
  parse(value: unknown): ProofData;
  format(value: ProofData): unknown;
}
