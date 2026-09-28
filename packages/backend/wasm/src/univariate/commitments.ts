import type { CurveRuntime } from "../runtime/curve/curve.js";
import {
  msmAffineMontgomeryChunks,
  type AffineMontgomeryMsmChunk,
} from "../runtime/group/affine-msm.js";
import { G1_AFFINE_BYTES } from "../runtime/group/group.js";
import type { UnivariateCrsChunkSection } from "./chunked-crs.js";

/** Commits a dense coefficient vector with the ordinary KZG power section. */
export async function commitDenseUnivariatePolynomial(
  runtime: CurveRuntime,
  kzgPowers: UnivariateCrsChunkSection,
  coefficients: Uint8Array,
  chunkPoints: number,
  firstPower = 0,
): Promise<Uint8Array> {
  const coefficientCount = fieldElementCount(runtime, coefficients, "Dense polynomial coefficients");
  assertKzgRange(kzgPowers, firstPower + coefficientCount, "Dense polynomial");
  return msmAffineMontgomeryChunks(
    runtime,
    contiguousChunks(kzgPowers, coefficients, firstPower, coefficientCount, runtime.Fr.byteLength, chunkPoints),
  );
}

/** The two selection queries use identical coefficients, but distinct bases. */
export async function commitSharedCoefficients(
  runtime: CurveRuntime,
  first: UnivariateCrsChunkSection,
  second: UnivariateCrsChunkSection,
  coefficients: Uint8Array,
  chunkPoints: number,
): Promise<readonly [Uint8Array, Uint8Array]> {
  const count = fieldElementCount(runtime, coefficients, "Shared polynomial coefficients");
  assertKzgRange(first, count, "First shared polynomial");
  assertKzgRange(second, count, "Second shared polynomial");
  assertChunkPoints(chunkPoints);
  const outputs = [runtime.G1.zero, runtime.G1.zero];
  for (let start = 0; start < count; start += chunkPoints) {
    const take = Math.min(chunkPoints, count - start);
    const scalars = await runtime.Fr.batchFromMontgomeryBuffer(coefficients.subarray(start * 32, (start + take) * 32));
    for (const [index, section] of [first, second].entries()) {
      const term = await runtime.G1.msmAffineRaw(await section.readElements(start, take), scalars);
      if (!runtime.G1.isZero(term)) outputs[index] = runtime.G1.isZero(outputs[index]!) ? term : runtime.G1.add(outputs[index]!, term);
    }
  }
  return [outputs[0]!, outputs[1]!];
}

async function* contiguousChunks(
  bases: UnivariateCrsChunkSection,
  coefficients: Uint8Array,
  firstPower: number,
  count: number,
  fieldElementBytes: number,
  chunkPoints: number,
): AsyncIterable<AffineMontgomeryMsmChunk> {
  assertChunkPoints(chunkPoints);
  for (let start = 0; start < count; start += chunkPoints) {
    const end = Math.min(start + chunkPoints, count);
    yield {
      bases: await bases.readElements(firstPower + start, end - start),
      montgomeryScalars: coefficients.subarray(start * fieldElementBytes, end * fieldElementBytes),
    };
  }
}

function fieldElementCount(runtime: CurveRuntime, values: Uint8Array, label: string): number {
  if (values.byteLength % runtime.Fr.byteLength !== 0) {
    throw new Error(`${label} must contain whole field elements.`);
  }
  return values.byteLength / runtime.Fr.byteLength;
}

function assertKzgRange(section: UnivariateCrsChunkSection, requiredCount: number, label: string): void {
  if (
    section.elementByteLength !== G1_AFFINE_BYTES
    || section.elementCount < requiredCount
  ) {
    throw new Error(`${label} requires ${requiredCount} ordinary KZG powers.`);
  }
}

function assertChunkPoints(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Preprocess MSM chunk size must be a positive safe integer.");
  }
}
