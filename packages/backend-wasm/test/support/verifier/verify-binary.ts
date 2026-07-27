import type { CurveRuntime } from "../../../src/runtime/curve/curve.js";
import {
  loadVerifierInputFromBinaryInput,
  type VerifierBinaryInput,
} from "../../../src/verifier/api/binary-input.js";
import {
  verifySnark,
  type VerifySnarkOptions,
} from "../../../src/verifier/protocol/verify-snark.js";

export async function verifyBinaryForTest(
  runtime: CurveRuntime,
  input: VerifierBinaryInput,
  options: VerifySnarkOptions = {},
): Promise<boolean> {
  const verifierInput = await loadVerifierInputFromBinaryInput(runtime, input);
  return verifySnark(runtime, verifierInput, options);
}
