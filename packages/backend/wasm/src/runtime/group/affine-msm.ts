import type { CurveRuntime } from "../curve/curve.js";

export interface AffineMontgomeryMsmChunk {
  readonly bases: Uint8Array;
  readonly montgomeryScalars: Uint8Array;
}

/** Coalesce sources of one commitment; never combine separate transcript points. */
export async function* coalesceAffineMsmChunks(chunks: AsyncIterable<AffineMontgomeryMsmChunk>, maxPoints: number): AsyncIterable<AffineMontgomeryMsmChunk> {
  if (!Number.isSafeInteger(maxPoints) || maxPoints <= 0) throw new Error("MSM chunk bound must be a positive safe integer.");
  let bases = new Uint8Array(maxPoints * 96), scalars = new Uint8Array(maxPoints * 32), used = 0;
  for await (const chunk of chunks) {
    const count = chunk.montgomeryScalars.length / 32;
    if (!Number.isInteger(count) || chunk.bases.length !== count * 96) throw new Error("MSM source length mismatch.");
    for (let first = 0; first < count;) {
      const take = Math.min(count - first, maxPoints - used);
      bases.set(chunk.bases.subarray(first * 96, (first + take) * 96), used * 96);
      scalars.set(chunk.montgomeryScalars.subarray(first * 32, (first + take) * 32), used * 32);
      used += take; first += take;
      if (used === maxPoints) {
        yield { bases, montgomeryScalars: scalars };
        bases = new Uint8Array(maxPoints * 96); scalars = new Uint8Array(maxPoints * 32); used = 0;
      }
    }
  }
  if (used) yield { bases: bases.subarray(0, used * 96), montgomeryScalars: scalars.subarray(0, used * 32) };
}

export async function msmAffineMontgomeryChunks(
  runtime: CurveRuntime,
  chunks: Iterable<AffineMontgomeryMsmChunk> | AsyncIterable<AffineMontgomeryMsmChunk>,
): Promise<Uint8Array> {
  let result = runtime.G1.zero;
  for await (const chunk of chunks) {
    const rawScalars = await runtime.Fr.batchFromMontgomeryBuffer(
      chunk.montgomeryScalars,
    );
    const term = await runtime.G1.msmAffineRaw(chunk.bases, rawScalars);
    // ffjavascript's mixed affine/projective infinity addition is not identity-safe.
    if (!runtime.G1.isZero(term)) result = runtime.G1.isZero(result) ? term : runtime.G1.add(result, term);
  }
  return result;
}
