import type { CurveRuntime } from "../../runtime/curve/curve.js";
import {
  loadVerifierInputFromBinaryInput,
  type VerifierBinaryInput,
} from "./binary-input.js";
import { verifySnark, type VerifySnarkOptions } from "../protocol/verify-snark.js";

export async function verifyBinary(
  runtime: CurveRuntime,
  input: VerifierBinaryInput,
  options: VerifySnarkOptions = {},
): Promise<boolean> {
  const verifierInput = await loadVerifierInputFromBinaryInput(runtime, input);
  const result = await verifySnark(runtime, verifierInput, options);
  return result.valid;
}
