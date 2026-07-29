import path from "node:path";

import { BinaryArtifactFileKind } from "../../../src/artifacts/binary/binary-format.js";
import { decodeBinaryArtifactFile } from "../../../src/artifacts/binary/binary-artifact-file.js";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { proveSnark } from "../../../src/prover/api/prove-snark.js";
import { readProverRuntimeInput, readVerifierBinaryInput } from "../../support/runtime-inputs.js";
import { verifyBinaryForTest } from "../../support/verifier/verify-binary.js";

async function main(): Promise<void> {
  const runtimeDir = path.resolve("fixtures/small/runtime");
  const runtime = await createCurveRuntime();

  try {
    const proverInput = await readProverRuntimeInput(runtime, runtimeDir);
    const generatedProof = await proveSnark(runtime, proverInput);
    const artifact = await decodeBinaryArtifactFile(generatedProof);
    if (artifact.kind !== BinaryArtifactFileKind.VerifierProof) {
      throw new Error(`Prover output artifact kind mismatch: ${artifact.kind}.`);
    }

    const verifierInput = await readVerifierBinaryInput(runtimeDir, generatedProof);
    const verificationResult = await verifyBinaryForTest(runtime, verifierInput, {
      randomScalar: () => runtime.Fr.one,
    });
    if (!verificationResult) {
      throw new Error("Verifier rejected the proof produced from prepared prover runtime fixtures.");
    }
  } finally {
    await runtime.terminate();
  }

  console.log("Checked prover binary output against the prepared verifier runtime path");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
