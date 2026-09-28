import assert from "node:assert/strict";

import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { DenseUnivariatePolynomial } from "../../../src/univariate/polynomial.js";

const runtime = await createCurveRuntime();
try {
  const polynomial = (values: readonly bigint[]) => DenseUnivariatePolynomial.fromCoefficients(
    runtime.Fr,
    runtime.Fr.concat(values.map((value) => runtime.Fr.fromBigInt(value))),
  );
  const left = polynomial([1n, 2n, 3n]);
  const right = polynomial([4n, 5n]);
  const product = await left.multiply(right);
  assert.deepEqual(
    Array.from({ length: product.degree + 1 }, (_, index) => runtime.Fr.toBigInt(runtime.Fr.readBufferElement(product.coefficients, index))),
    [4n, 13n, 22n, 15n],
  );
  assert.deepEqual(left.multiplyVanishing(4).divideVanishingExact(4).coefficients, left.coefficients);
  const ruffini = left.ruffini(runtime.Fr.fromBigInt(2n));
  assert.equal(runtime.Fr.toBigInt(ruffini.value), 17n);
  assert.deepEqual(
    Array.from({ length: ruffini.quotient.degree + 1 }, (_, index) => runtime.Fr.toBigInt(runtime.Fr.readBufferElement(ruffini.quotient.coefficients, index))),
    [8n, 3n],
  );
} finally {
  await runtime.terminate();
}

console.log("Checked direct univariate FieldRuntime polynomial operations");
