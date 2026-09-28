import type { CurveRuntime } from "../../src/runtime/curve/curve.js";
import type { SetupParams } from "../../src/artifacts/setup/setup-params.js";
import type { FixedVerifier } from "../../src/univariate/reference-verifier.js";
import { decodePoint } from "../../src/univariate/artifact-points.js";
import { deriveUnivariateDomainShape } from "../../src/univariate/domain.js";
/** Build-only preparation, also used to compile independent small E2E fixtures. */
export function prepareFixedVerifier(
  runtime: CurveRuntime,
  canonical: Uint8Array,
  setup: SetupParams,
  freePublicLength: number,
): FixedVerifier {
  if(canonical.length !== 3 * 96 + 4 * 192)
    throw new Error("Invalid exported verifier key length.");
  const f = runtime.Fr, domain = deriveUnivariateDomainShape(f, setup);
  const g1 = Array.from({ length: 3 }, (_, i) => decodePoint(runtime, canonical.subarray(i * 96, (i + 1) * 96)));
  const g2 = Array.from({ length: 4 }, (_, i) => decodePoint(runtime, canonical.subarray(288 + i * 192, 288 + (i + 1) * 192), true));
  if(g1.some(p => runtime.G1.isZero(p)) || g2.some(p => runtime.G2.isZero(p)))
    throw new Error("Fixed verifier keys must be nonzero.");
  const root = f.rootOfUnity(freePublicLength);
  const inv = f.inv(f.fromBigInt(BigInt(freePublicLength)));
  const roots = Array.from({ length: freePublicLength }, (_, i) => f.pow(root, i));
  const tables = g1.map(base => {
    const points: Uint8Array[] = [];
    for(let window = 0; window < 64; window++) {
      const shifted = runtime.G1.mulScalar(base, f.fromBigInt(1n << BigInt(window * 4)));
      let point = runtime.G1.zero;
      for(let digit = 1; digit < 16; digit++) {
        point = runtime.G1.add(point, shifted);
        points.push(runtime.G1.toAffine(point));
      }
    }
    return points;
  });
  return {
    arithmeticSize: domain.arithmeticSize, connectionSize: domain.connectionSize, freePublicLength,
    connectionRoot: domain.connectionRoot, inverseConnectionSize: f.inv(f.fromBigInt(BigInt(domain.connectionSize))),
    publicRoots: roots, publicWeights: roots.map(z => f.mul(z, inv)), g1Tables: tables,
    preparedG2: g2.map(p => runtime.pairing.prepareG2(p)),
  };
}
export function renderFixedVerifier(fixed: FixedVerifier): string {
  const emit = (value: Uint8Array) => "new Uint8Array([" + Array.from(value).join(",") + "])";
  const vector = (values: readonly Uint8Array[]) => "[" + values.map(emit).join(",\n") + "]";
  return [
    "// Generated from checked verifier keys and the active circuit library. Do not edit.",
    "export const FIXED_VERIFIER = {",
    `arithmeticSize:${fixed.arithmeticSize}, connectionSize:${fixed.connectionSize}, freePublicLength:${fixed.freePublicLength},`,
    "connectionRoot:" + emit(fixed.connectionRoot) + ",",
    "inverseConnectionSize:" + emit(fixed.inverseConnectionSize) + ",",
    "publicRoots:" + vector(fixed.publicRoots) + ",",
    "publicWeights:" + vector(fixed.publicWeights) + ",",
    "g1Tables:[" + fixed.g1Tables.map(vector).join(",\n") + "],",
    "preparedG2:" + vector(fixed.preparedG2) + ",",
    "} as const;\n",
  ].join("\n");
}
