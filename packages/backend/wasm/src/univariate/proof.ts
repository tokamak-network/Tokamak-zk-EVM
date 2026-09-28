import { encodeProofBytes, decodeProofBytes } from "../generated/artifact-bytes.generated.js";
import type { CurveRuntime } from "../runtime/curve/curve.js";
import type { FieldElement } from "../runtime/field/field-types.js";
import type { G1Point } from "../runtime/group/group.js";
import { encodePoint, decodePoint, decodeScalar } from "./artifact-points.js";
export interface UnivariateProof {
  readonly g1: readonly [
    G1Point,
    G1Point,
    G1Point,
    G1Point,
    G1Point,
    G1Point,
    G1Point,
    G1Point,
    G1Point,
    G1Point
  ];
  readonly evaluations: readonly [
    FieldElement,
    FieldElement,
    FieldElement,
    FieldElement,
    FieldElement,
    FieldElement,
    FieldElement
  ];
}
export async function encodeUnivariateProof(runtime: CurveRuntime, proof: UnivariateProof): Promise<Uint8Array> {
  const [c_l, c_h, c_o, d_q, d_q_k, c_d, c_r, c_q, pi_chi, pi_plus] = proof.g1.map(p => encodePoint(runtime, p));
  const [s_c, u, v, w, b, r, r_plus] = proof.evaluations.map(v => runtime.Fr.toRawLittleEndian(v));
  return encodeProofBytes({ c_l, c_h, c_o, d_q, d_q_k, c_d, c_r, c_q, pi_chi, pi_plus, s_c, u, v, w, b, r, r_plus });
}
export function decodeUnivariateProof(runtime: CurveRuntime, bytes: Uint8Array): UnivariateProof {
  const p = decodeProofBytes(bytes);
  return {
    g1: [p.c_l, p.c_h, p.c_o, p.d_q, p.d_q_k, p.c_d, p.c_r, p.c_q, p.pi_chi, p.pi_plus].map(p => decodePoint(runtime, p)) as unknown as UnivariateProof["g1"],
    evaluations: [p.s_c, p.u, p.v, p.w, p.b, p.r, p.r_plus].map(v => decodeScalar(runtime, v)) as unknown as UnivariateProof["evaluations"],
  };
}
