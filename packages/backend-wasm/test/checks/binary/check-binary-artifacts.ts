import { fileURLToPath } from "node:url";

import { PROVER_CRS_V1_SPEC } from "../../../src/artifacts/specs/prover-crs.v1.generated.js";
import { SIGMA_VERIFY_V1_SPEC } from "../../../src/artifacts/specs/sigma-verify.v1.generated.js";
import { VERIFIER_PREPROCESS_V1_SPEC } from "../../../src/artifacts/specs/verifier-preprocess.v1.generated.js";
import {
  BinaryArtifactFileKind,
  BinarySectionEncoding,
  BinarySectionType,
  createBinaryArtifactFile,
  createCurveRuntime,
  loadProverCrsArtifact,
  loadRuntimeArtifactFile,
  loadSigmaVerifyArtifact,
  loadVerifierPreprocessArtifact,
  type BinarySectionInput,
  type CurveRuntime,
  validateRuntimeArtifactFile,
} from "../../../src/index.js";

async function main(): Promise<void> {
  const runtime = await createCurveRuntime();

  try {
    await checkSigmaVerifyArtifact(runtime);
    await checkVerifierPreprocessArtifact(runtime);
    await checkProverCrsArtifact(runtime);
  } finally {
    await runtime.terminate();
  }

  console.log("Checked production runtime artifact formats");
}

async function checkSigmaVerifyArtifact(runtime: CurveRuntime): Promise<void> {
  const binary = await createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.VerifierCrs,
    sourcePackageVersion: "0.0.0",
    sections: [
      {
        type: BinarySectionType.CrsG1,
        encoding: BinarySectionEncoding.FfjsG1Affine96,
        label: "sigma.g1",
        elementCount: 4,
        elementByteLength: 96,
        data: concatBytes([runtime.G1.generator, runtime.G1.generator, runtime.G1.generator, runtime.G1.generator]),
      },
      {
        type: BinarySectionType.CrsG2,
        encoding: BinarySectionEncoding.FfjsG2Affine192,
        label: "sigma.g2",
        elementCount: 10,
        elementByteLength: 192,
        data: concatBytes(
          Array.from({ length: 10 }, () => runtime.G2.generator),
        ),
      },
    ],
  });
  const artifactFile = await loadRuntimeArtifactFile(binary);
  await validateRuntimeArtifactFile(binary, SIGMA_VERIFY_V1_SPEC, {
    expectedKind: BinaryArtifactFileKind.VerifierCrs,
  });
  const sigma = loadSigmaVerifyArtifact(artifactFile);

  assertEqual(sigma.sections.length, 2, "sigma_verify section count");
  assertEqual(sigma.pointsByName.G.byteLength, 96, "sigma_verify G byte length");
  assertEqual(sigma.pointsByName["sigma2.y"].byteLength, 192, "sigma_verify sigma2.y byte length");
}

async function checkVerifierPreprocessArtifact(runtime: CurveRuntime): Promise<void> {
  const binary = await createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.VerifierPreprocess,
    sourcePackageVersion: "0.0.0",
    sections: [
      {
        type: BinarySectionType.Preprocess,
        encoding: BinarySectionEncoding.FfjsG1Affine96,
        label: "preprocess.g1",
        elementCount: 3,
        elementByteLength: 96,
        data: concatBytes([runtime.G1.generator, runtime.G1.generator, runtime.G1.generator]),
      },
    ],
  });
  const artifactFile = await loadRuntimeArtifactFile(binary);
  await validateRuntimeArtifactFile(binary, VERIFIER_PREPROCESS_V1_SPEC, {
    expectedKind: BinaryArtifactFileKind.VerifierPreprocess,
  });
  const preprocess = loadVerifierPreprocessArtifact(artifactFile);

  assertEqual(preprocess.sections.length, 1, "verifier_preprocess section count");
  assertEqual(preprocess.pointsByName.s0.byteLength, 96, "verifier_preprocess s0 byte length");
  assertEqual(preprocess.pointsByName.O_pub_fix.byteLength, 96, "verifier_preprocess O_pub_fix byte length");
}

async function checkProverCrsArtifact(runtime: CurveRuntime): Promise<void> {
  const binary = await createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.ProverCrs,
    sourcePackageVersion: "0.0.0",
    sections: [
      createRepeatedG1Section(runtime, "sigma.g1", BinarySectionType.CrsG1, 6),
      createRepeatedG1Section(runtime, "sigma1.xy-powers", BinarySectionType.CrsG1, 2),
      createRepeatedG1Section(runtime, "sigma1.gamma-inv-o-inst", BinarySectionType.CrsG1, 1),
      createRepeatedG1Section(runtime, "sigma1.eta-inv-li-o-inter-alpha4-kj", BinarySectionType.CrsG1, 1),
      createRepeatedG1Section(runtime, "sigma1.delta-inv-li-o-prv", BinarySectionType.CrsG1, 1),
      createRepeatedG1Section(runtime, "sigma1.delta-inv-alphak-xh-tx", BinarySectionType.CrsG1, 1),
      createRepeatedG1Section(runtime, "sigma1.delta-inv-alpha4-xj-tx", BinarySectionType.CrsG1, 1),
      createRepeatedG1Section(runtime, "sigma1.delta-inv-alphak-yi-ty", BinarySectionType.CrsG1, 1),
      {
        type: BinarySectionType.CrsG2,
        encoding: BinarySectionEncoding.FfjsG2Affine192,
        label: "sigma.g2",
        elementCount: 10,
        elementByteLength: 192,
        data: concatBytes(Array.from({ length: 10 }, () => runtime.G2.generator)),
      },
    ],
  });
  const artifactFile = await loadRuntimeArtifactFile(binary);
  await validateRuntimeArtifactFile(binary, PROVER_CRS_V1_SPEC, {
    expectedKind: BinaryArtifactFileKind.ProverCrs,
  });
  const proverCrs = loadProverCrsArtifact(artifactFile);

  assertEqual(proverCrs.sections.length, 9, "prover_crs section count");
  assertEqual(proverCrs.pointsByName.G.byteLength, 96, "prover_crs G byte length");
  assertEqual(proverCrs.pointsByName["sigma1.delta"].byteLength, 96, "prover_crs sigma1.delta byte length");
  assertEqual(proverCrs.pointsByName["sigma2.y"].byteLength, 192, "prover_crs sigma2.y byte length");
}

function createRepeatedG1Section(
  runtime: CurveRuntime,
  label: string,
  type: BinarySectionType,
  elementCount: number,
): BinarySectionInput {
  return {
    type,
    encoding: BinarySectionEncoding.FfjsG1Affine96,
    label,
    elementCount,
    elementByteLength: 96,
    data: concatBytes(Array.from({ length: elementCount }, () => runtime.G1.generator)),
  };
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Binary artifact check failed: ${message}`);
    process.exitCode = 1;
  });
}
