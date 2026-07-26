import type { CurveRuntime } from "../../core/curve/curve.js";
import {
  loadProverInputFromBinaryInput,
  type ProverBinaryInput,
} from "./binary-input.js";
import { proveSnark, type ProveSnarkOptions } from "./prove-snark.js";

export async function proveBinary(
  runtime: CurveRuntime,
  input: ProverBinaryInput,
  options: ProveSnarkOptions = {},
): Promise<Uint8Array> {
  const proverInput = await loadProverInputFromBinaryInput(runtime, input);
  const result = await proveSnark(runtime, proverInput, options);

  return result.proof;
}
