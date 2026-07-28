import type { CurveRuntime } from "../curve/curve.js";

export interface AffineMontgomeryMsmChunk {
  readonly bases: Uint8Array;
  readonly montgomeryScalars: Uint8Array;
}

export async function msmAffineMontgomeryChunks(
  runtime: CurveRuntime,
  chunks: Iterable<AffineMontgomeryMsmChunk>,
): Promise<Uint8Array> {
  let result = runtime.G1.zero;
  for (const chunk of chunks) {
    const rawScalars = await runtime.Fr.batchFromMontgomeryBuffer(
      chunk.montgomeryScalars,
    );
    result = runtime.G1.add(
      result,
      await runtime.G1.msmAffineRaw(chunk.bases, rawScalars),
    );
  }
  return result;
}
