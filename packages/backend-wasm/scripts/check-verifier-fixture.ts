import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DensePolynomialExt,
  buildDomainContext,
  collectChallenges,
  createCurveRuntime,
  evalLagrangeK0,
  lhsCopy,
  lhsCopyMsm,
  loadVerifierInputFromRuntimeBundles,
  parseRuntimeArtifactBundleManifest,
  decodeVerifierBinaryResult,
  verifyBinary,
  type AffinePointJson,
  type CurveRuntime,
  type FieldElement,
  type RuntimeArtifactBundleManifest,
  type VerifierSetupParams,
} from "../src/index.js";
import {
  verifySnark,
  type VerifierInput,
  type VerifierPreprocess,
  type VerifierProof,
} from "../src/verifier/verify-snark.js";

interface FullProofFixtureInput {
  readonly artifacts: {
    readonly setupParams: VerifierSetupParams;
    readonly instance: {
      readonly a_pub_user: readonly string[];
      readonly a_pub_block: readonly string[];
    };
    readonly preprocess: FormattedPreprocessJson;
    readonly proof: FormattedProofJson;
    readonly sigmaVerify: SigmaVerifyJson;
  };
}

interface FullProofFixtureExpected {
  readonly verification: {
    readonly nativeVerifierResult: boolean;
  };
}

interface FormattedPreprocessJson {
  readonly preprocess_entries_part1: readonly string[];
  readonly preprocess_entries_part2: readonly string[];
}

interface FormattedProofJson {
  readonly proof_entries_part1: readonly string[];
  readonly proof_entries_part2: readonly string[];
}

interface SigmaVerifyJson {
  readonly G: AffinePointJson;
  readonly H: AffinePointJson;
  readonly sigma_1: {
    readonly x: AffinePointJson;
    readonly y: AffinePointJson;
  };
  readonly sigma_2: {
    readonly alpha: AffinePointJson;
    readonly alpha2: AffinePointJson;
    readonly alpha3: AffinePointJson;
    readonly alpha4: AffinePointJson;
    readonly gamma: AffinePointJson;
    readonly delta: AffinePointJson;
    readonly eta: AffinePointJson;
    readonly x: AffinePointJson;
    readonly y: AffinePointJson;
  };
  readonly lagrange_KL: AffinePointJson;
}

interface BinaryVerifierFixture {
  readonly proofManifest: RuntimeArtifactBundleManifest;
  readonly setupManifest: RuntimeArtifactBundleManifest;
  readonly resolveFile: (path: string) => Uint8Array | Promise<Uint8Array>;
  readonly verifierInput: VerifierInput;
}

async function main(): Promise<void> {
  const fixturesDir = path.resolve("fixtures/small");
  const input = await readJson<FullProofFixtureInput>(path.join(fixturesDir, "input/full-proof-small.json"));
  const expected = await readJson<FullProofFixtureExpected>(
    path.join(fixturesDir, "expected/full-proof-small.json"),
  );
  const runtime = await createCurveRuntime();

  try {
    const verifierInput = await buildVerifierInput(runtime, input);
    await checkLagrangeK0Formula(runtime, verifierInput);
    await checkG1CombinationCandidates(runtime, verifierInput);

    const result = await verifySnark(runtime, verifierInput, {
      randomScalar: () => runtime.Fr.one,
    });

    const binaryFixture = await loadPreparedBinaryVerifierFixture(runtime, fixturesDir);
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
    const flippedProofInput = await buildVerifierInput(runtime, fixtureWithFlippedProofScalar(input));
    const flippedResult = await verifySnark(runtime, flippedProofInput, {
      randomScalar: () => runtime.Fr.one,
    });

    if (result.valid !== expected.verification.nativeVerifierResult) {
      throw new Error(
        `Verifier result mismatch: expected ${expected.verification.nativeVerifierResult}, got ${result.valid}`,
      );
    }

    if (binaryValid !== expected.verification.nativeVerifierResult) {
      throw new Error(
        `Binary verifier result mismatch: expected ${expected.verification.nativeVerifierResult}, got ${binaryValid}`,
      );
    }

    if (binaryCoreResult.valid !== expected.verification.nativeVerifierResult) {
      throw new Error(
        `Binary verifier core result mismatch: expected ${expected.verification.nativeVerifierResult}, got ${binaryCoreResult.valid}`,
      );
    }

    if (flippedResult.valid !== false) {
      throw new Error("Verifier accepted a proof after one proof scalar bit was flipped.");
    }
  } finally {
    await runtime.terminate();
  }

  console.log("Checked verifier orchestration against the full proof fixture");
}

async function buildVerifierInput(
  runtime: CurveRuntime,
  fixture: FullProofFixtureInput,
): Promise<VerifierInput> {
  const setup = fixture.artifacts.setupParams;
  const publicInstance = publicInstanceValues(fixture);

  return {
    setup,
    sigma: parseSigma(runtime, fixture.artifacts.sigmaVerify),
    preprocess: parsePreprocess(runtime, fixture.artifacts.preprocess),
    proof: parseProof(runtime, fixture.artifacts.proof),
    aPubX: await DensePolynomialExt.fromRouEvals(
      runtime.Fr,
      publicInstance.map((value) => runtime.Fr.fromHex(value)),
      setup.l_free,
      1,
    ),
  };
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

  if (process.env.BACKEND_WASM_BENCH_G1_OVERHEAD === "1") {
    await benchmarkG1CombinationCandidates(runtime, input, domain, challenges, lagrangeK0Eval);
  }
}

async function benchmarkG1CombinationCandidates(
  runtime: CurveRuntime,
  input: VerifierInput,
  domain: ReturnType<typeof buildDomainContext>,
  challenges: Awaited<ReturnType<typeof collectChallenges>>,
  lagrangeK0Eval: FieldElement,
): Promise<void> {
  const iterations = 50;
  const lhsCopyBaselineMs = await measure(iterations, () => {
    lhsCopy(runtime.Fr, runtime.G1, input, domain, challenges, lagrangeK0Eval);
  });
  const lhsCopyMsmMs = await measure(iterations, async () => {
    await lhsCopyMsm(runtime.Fr, runtime.G1, input, domain, challenges, lagrangeK0Eval);
  });

  console.log(
    [
      "G1 combination timing:",
      `lhsCopy baseline ${lhsCopyBaselineMs.toFixed(3)} ms/op`,
      `lhsCopy MSM ${lhsCopyMsmMs.toFixed(3)} ms/op`,
    ].join(" "),
  );
}

async function measure(iterations: number, callback: () => void | Promise<void>): Promise<number> {
  for (let index = 0; index < 5; index += 1) {
    await callback();
  }

  const start = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    await callback();
  }

  return (performance.now() - start) / iterations;
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
    resolveFile,
    verifierInput: await loadVerifierInputFromRuntimeBundles(runtime, proofManifest, setupManifest, resolveFile),
  };
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
        "Prepare it in the owning package and run npm run fixtures:copy.",
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

function parseSigma(runtime: CurveRuntime, value: SigmaVerifyJson): VerifierInput["sigma"] {
  return {
    G: runtime.G1.parseAffine(value.G),
    H: runtime.G2.parseAffine(value.H),
    sigma1: {
      x: runtime.G1.parseAffine(value.sigma_1.x),
      y: runtime.G1.parseAffine(value.sigma_1.y),
    },
    sigma2: {
      alpha: runtime.G2.parseAffine(value.sigma_2.alpha),
      alpha2: runtime.G2.parseAffine(value.sigma_2.alpha2),
      alpha3: runtime.G2.parseAffine(value.sigma_2.alpha3),
      alpha4: runtime.G2.parseAffine(value.sigma_2.alpha4),
      gamma: runtime.G2.parseAffine(value.sigma_2.gamma),
      delta: runtime.G2.parseAffine(value.sigma_2.delta),
      eta: runtime.G2.parseAffine(value.sigma_2.eta),
      x: runtime.G2.parseAffine(value.sigma_2.x),
      y: runtime.G2.parseAffine(value.sigma_2.y),
    },
    lagrangeKL: runtime.G1.parseAffine(value.lagrange_KL),
  };
}

function parsePreprocess(runtime: CurveRuntime, value: FormattedPreprocessJson): VerifierPreprocess {
  const points = recoverG1Points(runtime, value.preprocess_entries_part1, value.preprocess_entries_part2, 3);

  return {
    s0: points[0],
    s1: points[1],
    O_pub_fix: points[2],
  };
}

function publicInstanceValues(fixture: FullProofFixtureInput): readonly string[] {
  const setup = fixture.artifacts.setupParams;
  const publicInstance = [
    ...fixture.artifacts.instance.a_pub_user.slice(0, setup.l_user),
    ...fixture.artifacts.instance.a_pub_block.slice(0, setup.l_free - setup.l_user),
  ];

  if (publicInstance.length !== setup.l_free) {
    throw new Error("Full proof fixture public instance length does not match setupParams.l_free.");
  }

  return publicInstance;
}

function parseProof(runtime: CurveRuntime, value: FormattedProofJson): VerifierProof {
  const points = recoverG1Points(runtime, value.proof_entries_part1, value.proof_entries_part2, 19);
  const scalarSlice = value.proof_entries_part2.slice(38);

  if (scalarSlice.length !== 4) {
    throw new Error("Formatted proof must contain four scalar evaluations.");
  }

  return {
    binding: {
      A_free: points[18],
      O_pub_free: points[17],
      O_mid: points[3],
      O_prv: points[4],
    },
    proof0: {
      U: points[0],
      V: points[1],
      W: points[2],
      Q_AX: points[5],
      Q_AY: points[6],
      B: points[11],
    },
    proof1: {
      R: points[12],
    },
    proof2: {
      Q_CX: points[7],
      Q_CY: points[8],
    },
    proof3: {
      R_eval: runtime.Fr.fromHex(scalarSlice[0]),
      R_omegaX_eval: runtime.Fr.fromHex(scalarSlice[1]),
      R_omegaX_omegaY_eval: runtime.Fr.fromHex(scalarSlice[2]),
      V_eval: runtime.Fr.fromHex(scalarSlice[3]),
    },
    proof4: {
      Pi_X: points[9],
      Pi_Y: points[10],
      M_X: points[14],
      M_Y: points[13],
      N_X: points[16],
      N_Y: points[15],
    },
  };
}

function fixtureWithFlippedProofScalar(fixture: FullProofFixtureInput): FullProofFixtureInput {
  const proofEntriesPart2 = [...fixture.artifacts.proof.proof_entries_part2];
  const firstScalarIndex = 38;

  if (proofEntriesPart2[firstScalarIndex] === undefined) {
    throw new Error("Formatted proof does not contain the first scalar evaluation to flip.");
  }

  proofEntriesPart2[firstScalarIndex] = flipLowestHexBit(proofEntriesPart2[firstScalarIndex]);

  return {
    ...fixture,
    artifacts: {
      ...fixture.artifacts,
      proof: {
        ...fixture.artifacts.proof,
        proof_entries_part2: proofEntriesPart2,
      },
    },
  };
}

function flipLowestHexBit(value: string): string {
  const digits = stripHex(value);
  const parsed = BigInt(`0x${digits}`) ^ 1n;

  return `0x${parsed.toString(16).padStart(digits.length, "0")}`;
}

function recoverG1Points(
  runtime: CurveRuntime,
  part1: readonly string[],
  part2: readonly string[],
  count: number,
): ReturnType<CurveRuntime["G1"]["parseAffine"]>[] {
  if (part1.length !== count * 2 || part2.length < count * 2) {
    throw new Error("Formatted G1 point parts do not match the expected count.");
  }

  const points: ReturnType<CurveRuntime["G1"]["parseAffine"]>[] = [];
  for (let index = 0; index < count * 2; index += 2) {
    points.push(
      runtime.G1.parseAffine({
        x: joinG1Coordinate(part1[index], part2[index]),
        y: joinG1Coordinate(part1[index + 1], part2[index + 1]),
      }),
    );
  }

  return points;
}

function joinG1Coordinate(part1: string, part2: string): string {
  return `0x${stripHex(part1).padStart(32, "0")}${stripHex(part2).padStart(64, "0")}`;
}

function stripHex(value: string): string {
  if (!/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new Error("Expected a 0x-prefixed hexadecimal string.");
  }

  return value.slice(2);
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Verifier fixture check failed: ${message}`);
    process.exitCode = 1;
  });
}
