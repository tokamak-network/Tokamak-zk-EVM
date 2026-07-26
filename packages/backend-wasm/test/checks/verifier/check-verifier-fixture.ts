import path from "node:path";

import { loadRuntimeArtifactFile } from "../../../src/artifacts/runtime/loaders.js";
import {
  createCurveRuntime,
  type CurveRuntime,
} from "../../../src/runtime/curve/curve.js";
import type { FieldElement } from "../../../src/runtime/field/field-runtime.js";
import {
  loadVerifierInputFromBinaryInput,
  type VerifierBinaryInput,
} from "../../../src/verifier/api/binary-input.js";
import { collectChallenges } from "../../../src/verifier/protocol/challenges.js";
import { buildDomainContext } from "../../../src/verifier/protocol/domain-context.js";
import {
  evalLagrangeK0,
  lhsCopy,
  lhsCopyMsm,
} from "../../../src/verifier/protocol/equations.js";
import { createVerifierPublicPolynomial } from "../../../src/verifier/protocol/public-instance-polynomial.js";
import { verifySnark, type VerifierInput } from "../../../src/verifier/protocol/verify-snark.js";
import { readVerifierBinaryInput } from "../../support/runtime-inputs.js";
import { verifyBinaryForTest } from "../../support/verifier/verify-binary.js";

interface BinaryVerifierFixture {
  readonly binaryInput: VerifierBinaryInput;
  readonly verifierInput: VerifierInput;
}

async function main(): Promise<void> {
  const fixturesDir = path.resolve("fixtures/small");
  const runtime = await createCurveRuntime();

  try {
    const binaryFixture = await loadPreparedBinaryVerifierFixture(runtime, fixturesDir);

    await checkLagrangeK0Formula(runtime, binaryFixture.verifierInput);
    await checkG1CombinationCandidates(runtime, binaryFixture.verifierInput);

    const binaryResult = await verifyBinaryForTest(
      runtime,
      binaryFixture.binaryInput,
      {
        randomScalar: () => runtime.Fr.one,
      },
    );
    const binaryCoreResult = await verifySnark(runtime, binaryFixture.verifierInput, {
      randomScalar: () => runtime.Fr.one,
    });
    const flippedProof = await flipProofScalarBit(binaryFixture.binaryInput.proof);
    const flippedResult = await verifyBinaryForTest(
      runtime,
      { ...binaryFixture.binaryInput, proof: flippedProof },
      {
        randomScalar: () => runtime.Fr.one,
      },
    );

    if (!binaryResult) {
      throw new Error("Binary verifier rejected the prepared full proof fixture.");
    }

    if (!binaryCoreResult) {
      throw new Error("Decoded-input verifier core rejected the prepared full proof fixture.");
    }

    if (flippedResult) {
      throw new Error("Binary verifier accepted a proof after one proof scalar bit was flipped.");
    }
  } finally {
    await runtime.terminate();
  }

  console.log("Checked verifier orchestration against the prepared runtime proof fixture");
}

async function checkLagrangeK0Formula(runtime: CurveRuntime, input: VerifierInput): Promise<void> {
  const challenges = await collectChallenges(runtime.Fr, runtime.G1, () => runtime.Fr.one, input.proof);
  const domain = buildDomainContext(runtime.Fr, input.setup, challenges);
  assertFieldEqual(
    runtime,
    evalLagrangeK0(runtime.Fr, domain, challenges),
    await evalLagrangeK0ByReconstruction(runtime, domain.mI, challenges.chi),
    "Fixture Lagrange K0",
  );

  for (const size of [1, 2, 4, 8, 16]) {
    const root = runtime.Fr.rootOfUnity(size);
    const points = [
      runtime.Fr.one,
      root,
      runtime.Fr.add(root, runtime.Fr.one),
      runtime.Fr.fromBigInt(5n),
      challenges.chi,
    ];

    for (const point of points) {
      const tMIEval = runtime.Fr.sub(runtime.Fr.pow(point, size), runtime.Fr.one);
      const actual = evalLagrangeK0(
        runtime.Fr,
        {
          mI: size,
          omegaMI: root,
          omegaSMax: runtime.Fr.one,
          tNEval: runtime.Fr.zero,
          tMIEval,
          tSMaxEval: runtime.Fr.zero,
        },
        {
          ...challenges,
          chi: point,
        },
      );
      const expected = await evalLagrangeK0ByReconstruction(runtime, size, point);
      assertFieldEqual(runtime, actual, expected, `Synthetic Lagrange K0 size ${size}`);
    }
  }
}

async function checkG1CombinationCandidates(runtime: CurveRuntime, input: VerifierInput): Promise<void> {
  const challenges = await collectChallenges(runtime.Fr, runtime.G1, () => runtime.Fr.one, input.proof);
  const domain = buildDomainContext(runtime.Fr, input.setup, challenges);
  const lagrangeK0Eval = evalLagrangeK0(runtime.Fr, domain, challenges);
  const lhsCopyBaseline = lhsCopy(runtime.Fr, runtime.G1, input, domain, challenges, lagrangeK0Eval);
  const lhsCopyCandidate = await lhsCopyMsm(runtime.Fr, runtime.G1, input, domain, challenges, lagrangeK0Eval);

  assertG1Equal(runtime, lhsCopyCandidate, lhsCopyBaseline, "lhsCopy MSM candidate");
}

async function evalLagrangeK0ByReconstruction(
  runtime: CurveRuntime,
  size: number,
  point: FieldElement,
): Promise<FieldElement> {
  const evaluations = Array.from({ length: size }, () => runtime.Fr.zero);
  evaluations[0] = runtime.Fr.one;
  const polynomial = await createVerifierPublicPolynomial(runtime.Fr, evaluations);

  return polynomial.evaluate(point);
}

function assertFieldEqual(
  runtime: CurveRuntime,
  actual: FieldElement,
  expected: FieldElement,
  label: string,
): void {
  if (!runtime.Fr.eq(actual, expected)) {
    throw new Error(`${label} mismatch: expected ${runtime.Fr.toHex(expected)}, got ${runtime.Fr.toHex(actual)}.`);
  }
}

function assertG1Equal(runtime: CurveRuntime, actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (!runtime.G1.eq(actual, expected)) {
    throw new Error(`${label} mismatch.`);
  }
}

async function loadPreparedBinaryVerifierFixture(
  runtime: CurveRuntime,
  fixturesDir: string,
): Promise<BinaryVerifierFixture> {
  const runtimeDir = path.join(fixturesDir, "runtime");
  const binaryInput = await readVerifierBinaryInput(runtimeDir);

  return {
    binaryInput,
    verifierInput: await loadVerifierInputFromBinaryInput(runtime, binaryInput),
  };
}

async function flipProofScalarBit(proof: Uint8Array): Promise<Uint8Array> {
  const flipped = proof.slice();
  const proofFile = await loadRuntimeArtifactFile(flipped);
  const evalSection = proofFile.sections.find((section) => section.label === "proof.evals");

  if (evalSection === undefined) {
    throw new Error("Prepared verifier proof artifact is missing the proof.evals section.");
  }

  flipped[evalSection.byteOffset] ^= 1;
  return flipped;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Verifier fixture check failed: ${message}`);
  process.exitCode = 1;
});
