import assert from "node:assert/strict";
import { preprocessSnark } from "../../../src/preprocess/protocol/preprocess-snark.js";
import { createPreprocessOutput } from "../../../src/preprocess/api/output.js";
import { decodePreprocessBytes } from "../../../src/generated/artifact-bytes.generated.js";
import { decodePoint, encodePoint } from "../../../src/univariate/artifact-points.js";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { SelectedRoots } from "../../../src/univariate/selected-roots.js";
import { deriveUnivariateDomainShape } from "../../../src/univariate/domain.js";
import { buildConnectionPermutationPolynomial } from "../../../src/univariate/relation.js";
import { DenseUnivariatePolynomial } from "../../../src/univariate/polynomial.js";
import type { UnivariateCrsChunkSection } from "../../../src/univariate/chunked-crs.js";
const setup = { n: 2, m: 4, m_b: 2, t: 2, s: 2, publicWirePhases: [{ name: "function-input", region: "fixed" as const, subcircuitIds: [0] }] };
const infos = [{
  id: 0, name: "buffer", Nwires: 4, NrealWires: 2, Nconsts: 0,
  Out_idx: [1, 0] as const, In_idx: [1, 1] as const, Wiring_idx: [0, 2] as const,
  Public_idx: [1, 1] as const, Internal_idx: [2, 0] as const,
  bufferDirection: "in" as const, publicPhase: "function-input",
}];
const permutation = [
  { row: 1, col: 0, X: 0, Y: 0 },
  { row: 0, col: 0, X: 1, Y: 0 },
];

const runtime = await createCurveRuntime();
try {
  for(const g2 of [false, true]) {
    const group = g2 ? runtime.G2 : runtime.G1;
    group.assertValid(group.zero);
    assert(group.isZero(decodePoint(runtime, encodePoint(runtime, group.zero, g2), g2)));
  }
  const f = runtime.Fr, tau = f.fromBigInt(2n);
  const section = (count: number, g2 = false, shift = 0): UnivariateCrsChunkSection => {
    const group = g2 ? runtime.G2 : runtime.G1, width = g2 ? 192 : 96;
    const bytes = new Uint8Array(count * width);
    for(let i = 0; i < count; i++)
      bytes.set(group.toAffine(group.mulScalar(group.generator, f.pow(tau, i + shift))), i * width);
    return {
      label: "test", encoding: "test", elementCount: count, elementByteLength: width,
      async readElement(i) { return this.readElements(i, 1); },
      async readElements(first, n) { assert(first >= 0 && first + n <= count); return bytes.slice(first * width, (first + n) * width); },
      async readStridedElements() { throw new Error("unused"); }
    };
  };
  const input = {
    setup, selector: [0, null], permutation, subcircuitInfos: infos, publicInputs: [f.zero, f.fromBigInt(5n)],
    crs: { sc: section(4), selection: section(3, true, 6), fixedPublic: section(1) }
  };
  const pre = await preprocessSnark(runtime, input, { denseMsmChunkPoints: 2 });
  const domain = deriveUnivariateDomainShape(f, setup);
  const sc = await buildConnectionPermutationPolynomial(f, domain, setup, input.selector, permutation, infos);
  const scPoly = DenseUnivariatePolynomial.fromCoefficients(f, sc.coefficients);
  assert(runtime.G1.eq(pre.sC, runtime.G1.mulScalar(runtime.G1.generator, scPoly.evaluate(tau))));
  const roots = await SelectedRoots.create(f, setup, input.selector);
  assert(runtime.G2.eq(pre.eKappa, runtime.G2.mulScalar(runtime.G2.generator, f.mul(f.pow(tau, 6), roots.unselected().evaluate(tau)))));
  assert(runtime.G1.eq(pre.cFix, runtime.G1.mulScalar(runtime.G1.generator, input.publicInputs[1]!)));
  const bytes = await createPreprocessOutput(runtime, pre);
  assert.equal(bytes.length, 384);
  const decoded = decodePreprocessBytes(bytes);
  assert(runtime.G2.eq(decodePoint(runtime, decoded.e_kappa, true), pre.eKappa));
  assert.throws(() => decodePreprocessBytes(bytes.subarray(1)));
  await assert.rejects(() => preprocessSnark(runtime, { ...input, selector: [null, 0] }), /CIRCOM_CONST_ONE/);
  await assert.rejects(() => preprocessSnark(runtime, { ...input, permutation: permutation.slice(1) }), /Exactly one public coordinate/);
}
finally {
  await runtime.terminate();
}
console.log("Checked S_C, C_fix, E_kappa, canonical bytes and circuit admission.");
