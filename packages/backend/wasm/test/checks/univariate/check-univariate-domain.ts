import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { deriveUnivariateDomainShape, arithmeticIndex, connectionIndex, arithmeticComplementAt, connectionComplementAt, unionVanishingAt } from "../../../src/univariate/domain.js";
import { SelectedRoots } from "../../../src/univariate/selected-roots.js";
import type { SetupParams } from "../../../src/artifacts/setup/setup-params.js";
const fixtures = JSON.parse(await readFile(new URL("../../../../common/contracts/fixtures/univariate-domain-shape.v1.json", import.meta.url), "utf8"));
const runtime = await createCurveRuntime();
try {
  const f = runtime.Fr;
  for(const test of fixtures.cases) {
    const setup: SetupParams = test.setup;
    const domain = deriveUnivariateDomainShape(f, setup), e = test.expected;
    assert.equal(domain.arithmeticSize, e.N_A);
    assert.equal(domain.connectionSize, e.N_C);
    assert.equal(domain.subcircuitCapacity, e.t);
    assert.equal(domain.unionSize, e.N_union);
    assert.equal(arithmeticIndex(domain, setup, setup.s - 1, 0, setup.n - 1), e.arithmeticIndex);
    assert.equal(connectionIndex(setup, setup.s - 1, setup.m_b - 1), e.connectionIndex);
    const z = f.fromBigInt(17n), za = f.sub(f.pow(z, e.N_A), f.one), zc = f.sub(f.pow(z, e.N_C), f.one), zg = f.sub(f.pow(z, e.N_G), f.one);
    assert(f.eq(arithmeticComplementAt(f, domain, z), f.div(zc, zg)));
    assert(f.eq(connectionComplementAt(f, domain, z), f.div(za, zg)));
    assert(f.eq(unionVanishingAt(f, domain, z), f.div(f.mul(za, zc), zg)));
  }
  const setup: SetupParams = { m: 2, m_b: 2, t: 4, n: 2, s: 2, publicWirePhases: [] };
  for(const selector of [[0, 1], [0, null], [null, null]] as const) {
    const roots = await SelectedRoots.create(f, setup, selector), zu = roots.unselected();
    const product = await roots.polynomial.multiply(zu);
    for(let z = 1; z < 12; z++) {
      const p = f.fromBigInt(BigInt(z));
      assert(f.eq(product.evaluate(p), f.sub(f.pow(p, 8), f.one)));
    }
    const values = f.concat([f.fromBigInt(3n), selector[1] === null ? f.zero : f.fromBigInt(7n)]);
    const q = await roots.quotients(values);
    for(let i = 0; i < 2; i++) {
      const value = f.add(f.readBufferElement(q, 0), f.mul(roots.roots[i]!, f.readBufferElement(q, 1)));
      assert(f.eq(f.mul(value, zu.evaluate(roots.roots[i]!)), f.readBufferElement(values, i)));
    }
  }
  await assert.rejects(() => SelectedRoots.create(f, setup, [0, 3]));
  await assert.rejects(() => SelectedRoots.create(f, setup, [0]));
  assert.throws(() => deriveUnivariateDomainShape(f, { ...setup, t: 3 }));
}
finally {
  await runtime.terminate();
}
console.log("Checked current domain coordinates, capacities, selected roots and wire quotients.");
