
import type { CurveRuntime } from "../runtime/curve/curve.js";
import type { FieldElement } from "../runtime/field/field-types.js";
import type { UnivariateProof } from "./proof.js";
import { encodeEvaluationMessageBlock, encodeG1MessageBlock, UnivariateTranscript } from "./transcript.js";
export interface FixedVerifier {
  readonly arithmeticSize: number;
  readonly connectionSize: number;
  readonly freePublicLength: number;
  readonly connectionRoot: Uint8Array;
  readonly inverseConnectionSize: Uint8Array;
  readonly publicRoots: readonly Uint8Array[];
  readonly publicWeights: readonly Uint8Array[];
  readonly g1Tables: readonly (readonly Uint8Array[])[];
  readonly preparedG2: readonly Uint8Array[];
}
export interface UnivariateReferenceVerifierInput {
  readonly publicInputs: readonly FieldElement[];
  readonly fixed: FixedVerifier;
  readonly preprocess: {
    readonly sC: Uint8Array;
    readonly cFix: Uint8Array;
    readonly eKappa: Uint8Array;
  };
  readonly proof: UnivariateProof;
}
/** Online verification: all circuit/key-only arithmetic was performed at build time. */
export async function verifyUnivariateReference(runtime: CurveRuntime, input: UnivariateReferenceVerifierInput): Promise<boolean> {
  const f = runtime.Fr, g = runtime.G1, { fixed, preprocess, proof } = input;
  if(input.publicInputs.length !== fixed.freePublicLength)
    return false;
  const [cL, cH, cO, dQ, dQK, cD, cR, cQ, piChi, piPlus] = proof.g1;
  const [sc, u, v, w, b, r, rPlus] = proof.evaluations;
  const transcript = new UnivariateTranscript(f, input.publicInputs);
  transcript.setMessage(encodeG1MessageBlock("F2.a1", g, [cL, cH, cO, dQ, dQK]));
  const upsilon = transcript.challenge(1, 0);
  transcript.setMessage(encodeG1MessageBlock("F2.a2", g, [cD]));
  const [beta, gamma] = transcript.challengePair(2);
  transcript.setMessage(encodeG1MessageBlock("F2.a3", g, [cR]));
  const theta = transcript.challenge(3, 0);
  transcript.setMessage(encodeG1MessageBlock("F2.a4", g, [cQ]));
  const chi = transcript.zeta(fixed.arithmeticSize, fixed.connectionSize);
  transcript.setMessage(encodeEvaluationMessageBlock(f, proof.evaluations));
  const varpi = transcript.challenge(5, 0);
  transcript.setMessage(encodeG1MessageBlock("F2.a6", g, [piChi, piPlus]));
  const mu = transcript.nonzeroChallenge(6, 0);
  const za = f.sub(f.pow(chi, fixed.arithmeticSize), f.one), zc = f.sub(f.pow(chi, fixed.connectionSize), f.one);
  const zg = f.sub(f.pow(chi, Math.min(fixed.arithmeticSize, fixed.connectionSize)), f.one);
  const ma = f.div(zc, zg), mc = f.div(za, zg), union = f.mul(za, ma);
  const l0 = f.div(f.mul(zc, fixed.inverseConnectionSize), f.sub(chi, f.one));
  const q = f.div(f.add(f.add(f.mul(ma, f.sub(f.mul(u, v), w)), f.mul(f.mul(theta, mc), f.mul(f.sub(r, f.one), l0))), f.mul(f.mul(f.square(theta), mc), f.sub(f.mul(rPlus, f.add(f.add(b, f.mul(beta, chi)), gamma)), f.mul(r, f.add(f.add(b, f.mul(beta, sc)), gamma))))), union);
  let a = f.zero;
  const rootIndex = fixed.publicRoots.findIndex(root => f.eq(root, chi));
  if(rootIndex >= 0)
    a = input.publicInputs[rootIndex]!;
  else if(fixed.freePublicLength > 0) {
    const inverses = await f.batchInverseBuffer(f.concat(fixed.publicRoots.map(root => f.sub(chi, root))));
    for(let i = 0; i < input.publicInputs.length; i++)
      a = f.add(a, f.mul(f.mul(input.publicInputs[i]!, fixed.publicWeights[i]!), f.readBufferElement(inverses, i)));
    a = f.mul(a, f.sub(f.pow(chi, fixed.freePublicLength), f.one));
  }
  const v2 = f.square(varpi), v3 = f.mul(v2, varpi), v4 = f.square(v2);
  const m2 = f.square(mu), m3 = f.mul(m2, mu), m4 = f.square(m2);
  const add = (...points: Uint8Array[]) => points.reduce((a, b) => g.add(a, b), g.zero);
  const mul = (point: Uint8Array, scalar: Uint8Array) => g.mulScalar(point, scalar);
  const opening = add(cL, mul(cH, varpi), mul(cR, v2), mul(cQ, v3), mul(preprocess.sC, v4));
  const ce = add(cL, mul(cH, upsilon));
  const fixedMul = (index: number, scalar: Uint8Array) => {
    const bytes = f.toRawLittleEndian(scalar), table = fixed.g1Tables[index]!;
    let result = g.zero;
    for(let window = 0; window < 64; window++) {
      const digit = (bytes[window >> 1]! >> ((window & 1) * 4)) & 15;
      if(digit !== 0)
        result = g.add(result, table[window * 15 + digit - 1]!);
    }
    return result;
  };
  const first = add(cL, g.neg(mul(cD, mu)), mul(add(opening, mul(piChi, chi)), m2), mul(add(cR, mul(piPlus, f.mul(fixed.connectionRoot, chi))), m3), g.neg(fixedMul(0, f.add(f.mul(f.add(f.add(a, f.mul(v2, r)), f.add(f.mul(v3, q), f.mul(v4, sc))), m2), f.mul(rPlus, m3)))), g.neg(fixedMul(1, f.mul(f.add(u, f.mul(varpi, v)), m2))), g.neg(fixedMul(2, f.mul(f.add(w, f.mul(varpi, b)), m2))), g.neg(mul(dQK, m4)), g.neg(preprocess.cFix));
  const operands = [first, g.neg(add(mul(piChi, m2), mul(piPlus, m3))), add(cH, mul(ce, mu), mul(dQ, m4)), g.neg(cO), dQK];
  const prepared = [...fixed.preparedG2, runtime.pairing.prepareG2(preprocess.eKappa)];
  return runtime.pairing.preparedProductIsOne(operands.map((g1, i) => ({ g1, preparedG2: prepared[i]! })));
}
