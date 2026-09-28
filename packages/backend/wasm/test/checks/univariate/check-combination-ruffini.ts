import assert from "node:assert/strict";
import { getCurveFromName } from "ffjavascript";
import type { FfCurve, FfWorkerCommand } from "../../../src/runtime/curve/curve.js";
import { createFieldRuntime } from "../../../src/runtime/field/field-runtime.js";
import type { FieldElement } from "../../../src/runtime/field/field-types.js";
import type { WasmModuleBuilder } from "../../../src/runtime/field/kernel-builder-types.js";
import { installLinearBatchPlugin } from "../../../src/runtime/field/linear-batch-plugin.js";
import { FIELD_BATCH_ADD_SCALED, FIELD_RUFFINI_Y } from "../../../src/runtime/field/kernel-names.js";
import { DenseUnivariatePolynomial as P } from "../../../src/univariate/polynomial.js";

// Isolated candidate only: retain the combined polynomial in the Ruffini worker.
const raw = await getCurveFromName("bls12381", false, (module: WasmModuleBuilder) => installLinearBatchPlugin(module)) as FfCurve;
try {
  const f = createFieldRuntime(raw.Fr);
  type Terms = readonly (readonly [P, FieldElement])[];
  const candidate = async (terms: Terms, point: FieldElement) => {
    const count = Math.max(0, ...terms.map(([p]) => p.degree)) + 1;
    const task: FfWorkerCommand[] = [{ cmd: "ALLOCSET", var: 0, buff: f.createZeroBuffer(count) }];
    for (const [p, factor] of terms) if (!f.isZero(factor)) task.push(
      { cmd: "ALLOCSET", var: 1, buff: p.coefficients },
      { cmd: "ALLOCSET", var: 2, buff: factor },
      { cmd: "CALL", fnName: FIELD_BATCH_ADD_SCALED, params: [{ var: 0 }, { var: 1 }, { var: 2 }, { val: p.degree + 1 }, { var: 0 }] },
    );
    task.push({ cmd: "ALLOCSET", var: 3, buff: f.createZeroBuffer(count) });
    if (count > 1) task.push(
      { cmd: "ALLOCSET", var: 1, buff: point }, { cmd: "ALLOC", var: 4, len: 32 },
      { cmd: "CALL", fnName: FIELD_RUFFINI_Y, params: [{ var: 0 }, { val: count }, { var: 1 }, { var: 3 }, { var: 4 }] },
    );
    task.push({ cmd: "GET", out: 0, var: 3, len: count * 32 }, { cmd: "GET", out: 1, var: count === 1 ? 0 : 4, len: 32 });
    const out = await raw.Fr.tm.queueAction(task);
    return { quotient: P.fromCoefficients(f, out[0]!).coefficients, remainder: out[1]! };
  };
  const control = async (terms: Terms, point: FieldElement) => {
    const combined = await P.linearCombination(f, terms), out = await f.ruffiniYBuffer(combined.coefficients, combined.degree + 1, point);
    return { quotient: P.fromCoefficients(f, out.quotient).coefficients, remainder: out.remainder };
  };
  for (const n of [1, 2, 17, 65, 262144]) {
    const a = P.fromCoefficients(f, f.concat(Array.from({ length: n }, (_, i) => f.fromBigInt(BigInt(17 * i + 3)))));
    const small = P.fromCoefficients(f, a.coefficients.subarray(0, Math.min(n, 256) * 32));
    const cases: Terms[] = [[], [[a, f.zero]], [[a, f.one], [a, f.neg(f.one)]], [[a, f.one], [a, f.fromBigInt(13n)]], [[small, f.one], [a, f.fromBigInt(13n)], [a, f.fromBigInt(17n)], [a, f.fromBigInt(19n)]]];
    for (const terms of cases) {
      const point = f.fromBigInt(23n), expected = await control(terms, point);
      assert.deepEqual(await candidate(terms, point), expected);
      if (n === 262144 && (terms === cases[3] || terms === cases[4])) {
        const samples = [];
        for (let i = 0; i < 5; i++) for (const fused of i % 2 ? [true, false] : [false, true]) {
          const start = performance.now(), actual = await (fused ? candidate(terms, point) : control(terms, point));
          samples.push({ candidate: fused, ms: performance.now() - start }); assert.deepEqual(actual, expected);
        }
        console.log(JSON.stringify({ n, terms: terms.length, samples }));
      }
    }
  }
} finally { await raw.terminate?.(); }
console.log("Checked same-worker combination/Ruffini quotient and remainder, constants, zero terms, cancellation and unequal lengths.");
