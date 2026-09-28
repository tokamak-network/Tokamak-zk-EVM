import { createCurveRuntime, type CurveRuntime } from "../../runtime/curve/curve.js";

export async function withCurveRuntime<T>(
  convert: (runtime: CurveRuntime) => Promise<T>,
): Promise<T> {
  const runtime = await createCurveRuntime();
  try {
    return await convert(runtime);
  } finally {
    await runtime.terminate();
  }
}
