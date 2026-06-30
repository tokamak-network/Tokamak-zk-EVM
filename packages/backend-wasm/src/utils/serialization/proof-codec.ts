import type { ProofData } from "../../libs/types/proof.js";

export interface ProofCodec {
  parse(value: unknown): ProofData;
  format(value: ProofData): unknown;
}
