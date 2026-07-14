import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  DensePolynomialExt,
  RuntimeArtifactFileRole,
  buildDomainContext,
  collectChallenges,
  createCurveRuntime,
  decodeVerifierBinaryResult,
  evalLagrangeK0,
  lhsCopy,
  lhsCopyMsm,
  loadRuntimeArtifactFile,
  loadVerifierInputFromRuntimeBundles,
  parseRuntimeArtifactBundleManifest,
  verifyBinary,
  type CurveRuntime,
  type FieldElement,
  type RuntimeArtifactBundleManifest,
} from "../src/index.js";
import { verifySnark, type VerifierInput } from "../src/verifier/verify-snark.js";

interface BinaryVerifierFixture {
  readonly proofManifest: RuntimeArtifactBundleManifest;
  readonly setupManifest: RuntimeArtifactBundleManifest;
  readonly runtimeDir: string;
  readonly resolveFile: (path: string) => Uint8Array | Promise<Uint8Array>;
  readonly verifierInput: VerifierInput;
}

async function main(): Promise<void> {
  const fixturesDir = path.resolve("fixtures/small");
  const runtime = await createCurveRuntime();

  try {
    const binaryFixture = await loadPreparedBinaryVerifierFixture(runtime, fixturesDir);

    await checkLagrangeK0Formula(runtime, binaryFixture.verifierInput);
    await checkG1CombinationCandidates(runtime, binaryFixture.verifierInput);

    const binaryResult = await verifyBinary(
      runtime,
      binaryFixture.proofManifest,
      binaryFixture.setupManifest,
      binaryFixture.resolveFile,
      {
        randomScalar: () => runtime.Fr.one,
      },
    );
    const binaryValid = decodeVerifierBinaryResult(binaryResult);
    const binaryCoreResult = await verifySnark(runtime, binaryFixture.verifierInput, {
      randomScalar: () => runtime.Fr.one,
    });
    const flippedResult = await verifyBinary(
      runtime,
      binaryFixture.proofManifest,
      binaryFixture.setupManifest,
      createFlippedProofResolver(binaryFixture.runtimeDir, binaryFixture.proofManifest),
      {
        randomScalar: () => runtime.Fr.one,
      },
    );
    const flippedValid = decodeVerifierBinaryResult(flippedResult);

    if (!binaryValid) {
      throw new Error("Binary verifier rejected the prepared full proof fixture.");
    }

    if (!binaryCoreResult.valid) {
      throw new Error("Decoded-input verifier core rejected the prepared full proof fixture.");
    }

    if (flippedValid) {
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
  const polynomial = await DensePolynomialExt.fromRouEvals(runtime.Fr, evaluations, size, 1);

  return polynomial.eval(point, runtime.Fr.one);
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
  const proofManifest = parseRuntimeArtifactBundleManifest(
    await readPreparedRuntimeJson(runtimeDir, "verifier-proof-input/manifest.json"),
  );
  const setupManifest = parseRuntimeArtifactBundleManifest(
    await readPreparedRuntimeJson(runtimeDir, "verifier-setup-input/manifest.json"),
  );
  const resolveFile = (artifactPath: string): Promise<Uint8Array> =>
    readPreparedRuntimeFile(runtimeDir, artifactPath);

  return {
    proofManifest,
    setupManifest,
    runtimeDir,
    resolveFile,
    verifierInput: await loadVerifierInputFromRuntimeBundles(runtime, proofManifest, setupManifest, resolveFile),
  };
}

function createFlippedProofResolver(
  runtimeDir: string,
  proofManifest: RuntimeArtifactBundleManifest,
): (artifactPath: string) => Promise<Uint8Array> {
  const proofPath = requireBundleRolePath(proofManifest, RuntimeArtifactFileRole.Proof);

  return async (artifactPath: string): Promise<Uint8Array> => {
    const bytes = await readPreparedRuntimeFile(runtimeDir, artifactPath);

    if (artifactPath !== proofPath) {
      return bytes;
    }

    const flipped = bytes.slice();
    const proofFile = await loadRuntimeArtifactFile(flipped);
    const evalSection = proofFile.sections.find((section) => section.label === "proof.evals");

    if (evalSection === undefined) {
      throw new Error("Prepared verifier proof artifact is missing the proof.evals section.");
    }

    flipped[evalSection.byteOffset] ^= 1;

    return flipped;
  };
}

function requireBundleRolePath(manifest: RuntimeArtifactBundleManifest, role: RuntimeArtifactFileRole): string {
  const matches = manifest.files.filter((file) => file.role === role);

  if (matches.length !== 1) {
    throw new Error(`${manifest.kind} bundle must contain exactly one '${role}' file.`);
  }

  return matches[0].path;
}

async function readPreparedRuntimeJson<T>(runtimeDir: string, artifactPath: string): Promise<T> {
  const bytes = await readPreparedRuntimeFile(runtimeDir, artifactPath);

  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

async function readPreparedRuntimeFile(runtimeDir: string, artifactPath: string): Promise<Uint8Array> {
  const filePath = resolvePreparedRuntimePath(runtimeDir, artifactPath);

  try {
    return await readFile(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        `Required prepared verifier runtime fixture file is missing: ${path.relative(process.cwd(), filePath)}.`,
        "Prepare owner package outputs, run npm run fixtures:copy, then run npm run fixtures:prepare.",
        `Original read error: ${message}`,
      ].join(" "),
    );
  }
}

function resolvePreparedRuntimePath(runtimeDir: string, artifactPath: string): string {
  if (path.isAbsolute(artifactPath) || artifactPath.includes("\\") || artifactPath.split("/").includes("..")) {
    throw new Error(`Prepared runtime artifact path must be a safe relative POSIX path: ${artifactPath}`);
  }

  const filePath = path.resolve(runtimeDir, artifactPath);
  const relative = path.relative(runtimeDir, filePath);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Prepared runtime artifact path escapes fixtures/small/runtime: ${artifactPath}`);
  }

  return filePath;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Verifier fixture check failed: ${message}`);
  process.exitCode = 1;
});
