import {
  BinaryArtifactFileKind,
  BinarySectionEncoding,
  BinarySectionType,
  RuntimeArtifactBundleKind,
  RuntimeArtifactFileRole,
  buildDomainContext,
  collectChallenges,
  createBinaryArtifactFile,
  createCurveRuntime,
  encodeVerifierSetupParams,
  evalLagrangeK0,
  lhsCopy,
  lhsCopyMsm,
  loadVerifierInputFromRuntimeBundles,
  parseRuntimeArtifactBundleManifest,
  verifySnark,
  type AffinePointJson,
  type BinarySectionInput,
  type CurveRuntime,
  type FieldElement,
  type VerifierInput,
  type VerifierSetupParams,
} from "../../src/index.js";

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

declare global {
  interface Window {
    __tokamakVerifierResult?: {
      readonly status: "pending" | "ok" | "error";
      readonly valid?: boolean;
      readonly g1Timings?: BrowserG1Timings;
      readonly error?: string;
    };
  }
}

interface BrowserG1Timings {
  readonly lhsCopyBaselineMs: number;
  readonly lhsCopyMsmMs: number;
}

window.__tokamakVerifierResult = { status: "pending" };

main().catch((error: unknown) => {
  window.__tokamakVerifierResult = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  };
});

async function main(): Promise<void> {
  const [input, expected] = await Promise.all([
    fetchJson<FullProofFixtureInput>("/fixtures/small/input/full-proof-small.json"),
    fetchJson<FullProofFixtureExpected>("/fixtures/small/expected/full-proof-small.json"),
  ]);
  const runtime = await createCurveRuntime({ singleThread: true });

  try {
    const verifierInput = await buildBinaryVerifierInput(runtime, input);
    const g1Timings =
      new URLSearchParams(window.location.search).get("benchG1") === "1"
        ? await checkAndBenchmarkG1CombinationCandidates(runtime, verifierInput)
        : undefined;
    const result = await verifySnark(runtime, verifierInput, {
      randomScalar: () => runtime.Fr.one,
    });

    if (result.valid !== expected.verification.nativeVerifierResult) {
      throw new Error(
        `Browser verifier result mismatch: expected ${expected.verification.nativeVerifierResult}, got ${result.valid}.`,
      );
    }

    window.__tokamakVerifierResult = {
      status: "ok",
      valid: result.valid,
      g1Timings,
    };
  } finally {
    await runtime.terminate();
  }
}

async function checkAndBenchmarkG1CombinationCandidates(
  runtime: CurveRuntime,
  input: VerifierInput,
): Promise<BrowserG1Timings> {
  const challenges = await collectChallenges(runtime.Fr, runtime.G1, () => runtime.Fr.one, input.proof);
  const domain = buildDomainContext(runtime.Fr, input.setup, challenges);
  const lagrangeK0Eval = evalLagrangeK0(runtime.Fr, domain, challenges);
  const lhsCopyBaseline = lhsCopy(runtime.Fr, runtime.G1, input, domain, challenges, lagrangeK0Eval);
  const lhsCopyCandidate = await lhsCopyMsm(runtime.Fr, runtime.G1, input, domain, challenges, lagrangeK0Eval);

  assertG1Equal(runtime, lhsCopyCandidate, lhsCopyBaseline, "lhsCopy MSM candidate");

  return benchmarkG1CombinationCandidates(runtime, input, domain, challenges, lagrangeK0Eval);
}

async function benchmarkG1CombinationCandidates(
  runtime: CurveRuntime,
  input: VerifierInput,
  domain: ReturnType<typeof buildDomainContext>,
  challenges: Awaited<ReturnType<typeof collectChallenges>>,
  lagrangeK0Eval: FieldElement,
): Promise<BrowserG1Timings> {
  const iterations = 50;

  return {
    lhsCopyBaselineMs: await measure(iterations, () => {
      lhsCopy(runtime.Fr, runtime.G1, input, domain, challenges, lagrangeK0Eval);
    }),
    lhsCopyMsmMs: await measure(iterations, async () => {
      await lhsCopyMsm(runtime.Fr, runtime.G1, input, domain, challenges, lagrangeK0Eval);
    }),
  };
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

function assertG1Equal(runtime: CurveRuntime, actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (!runtime.G1.eq(actual, expected)) {
    throw new Error(`${label} mismatch.`);
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status}.`);
  }

  return (await response.json()) as T;
}

async function buildBinaryVerifierInput(runtime: CurveRuntime, fixture: FullProofFixtureInput) {
  const setup = fixture.artifacts.setupParams;
  const publicInstance = publicInstanceValues(fixture);
  const files = new Map<string, Uint8Array>();
  const instanceFile = await createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.VerifierInstance,
    sourcePackageVersion: "0.0.0",
    sections: [
      {
        type: BinarySectionType.Instance,
        encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
        label: "instance.public",
        elementCount: publicInstance.length,
        elementByteLength: 32,
        data: concatBytes(publicInstance.map((value) => runtime.Fr.fromHex(value))),
      },
    ],
  });
  const proofFile = await createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.VerifierProof,
    sourcePackageVersion: "0.0.0",
    sections: [
      {
        type: BinarySectionType.Proof,
        encoding: BinarySectionEncoding.FfjsG1Affine96,
        label: "proof.g1",
        elementCount: 19,
        elementByteLength: 96,
        data: concatBytes(
          recoverG1Points(
            runtime,
            fixture.artifacts.proof.proof_entries_part1,
            fixture.artifacts.proof.proof_entries_part2,
            19,
          ),
        ),
      },
      {
        type: BinarySectionType.Proof,
        encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
        label: "proof.evals",
        elementCount: 4,
        elementByteLength: 32,
        data: concatBytes(fixture.artifacts.proof.proof_entries_part2.slice(38).map((value) => runtime.Fr.fromHex(value))),
      },
    ],
  });
  const crsFile = await createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.VerifierCrs,
    sourcePackageVersion: "0.0.0",
    sections: createSigmaVerifySections(runtime, fixture.artifacts.sigmaVerify),
  });
  const preprocessFile = await createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.VerifierPreprocess,
    sourcePackageVersion: "0.0.0",
    sections: [
      {
        type: BinarySectionType.SetupParams,
        encoding: BinarySectionEncoding.Bytes,
        label: "setup.params",
        elementCount: 1,
        elementByteLength: 36,
        data: encodeVerifierSetupParams(setup),
      },
      {
        type: BinarySectionType.Preprocess,
        encoding: BinarySectionEncoding.FfjsG1Affine96,
        label: "preprocess.g1",
        elementCount: 3,
        elementByteLength: 96,
        data: concatBytes(
          recoverG1Points(
            runtime,
            fixture.artifacts.preprocess.preprocess_entries_part1,
            fixture.artifacts.preprocess.preprocess_entries_part2,
            3,
          ),
        ),
      },
    ],
  });

  files.set("instance.bin", instanceFile);
  files.set("proof.bin", proofFile);
  files.set("crs.bin", crsFile);
  files.set("preprocess.bin", preprocessFile);

  const proofManifest = parseRuntimeArtifactBundleManifest({
    schemaVersion: 1,
    kind: RuntimeArtifactBundleKind.VerifierProofInput,
    files: [
      {
        role: RuntimeArtifactFileRole.Instance,
        path: "instance.bin",
        byteLength: instanceFile.byteLength,
        artifactKind: BinaryArtifactFileKind.VerifierInstance,
      },
      {
        role: RuntimeArtifactFileRole.Proof,
        path: "proof.bin",
        byteLength: proofFile.byteLength,
        artifactKind: BinaryArtifactFileKind.VerifierProof,
      },
    ],
  });
  const setupManifest = parseRuntimeArtifactBundleManifest({
    schemaVersion: 1,
    kind: RuntimeArtifactBundleKind.VerifierSetupInput,
    files: [
      {
        role: RuntimeArtifactFileRole.Crs,
        path: "crs.bin",
        byteLength: crsFile.byteLength,
        artifactKind: BinaryArtifactFileKind.VerifierCrs,
      },
      {
        role: RuntimeArtifactFileRole.Preprocess,
        path: "preprocess.bin",
        byteLength: preprocessFile.byteLength,
        artifactKind: BinaryArtifactFileKind.VerifierPreprocess,
      },
    ],
  });

  return loadVerifierInputFromRuntimeBundles(runtime, proofManifest, setupManifest, (path) => {
    const file = files.get(path);
    if (file === undefined) {
      throw new Error(`Missing browser verifier fixture file '${path}'.`);
    }

    return file;
  });
}

function createSigmaVerifySections(runtime: CurveRuntime, value: SigmaVerifyJson): BinarySectionInput[] {
  return [
    {
      type: BinarySectionType.CrsG1,
      encoding: BinarySectionEncoding.FfjsG1Affine96,
      label: "sigma.g1",
      elementCount: 4,
      elementByteLength: 96,
      data: concatBytes([
        runtime.G1.parseAffine(value.G),
        runtime.G1.parseAffine(value.sigma_1.x),
        runtime.G1.parseAffine(value.sigma_1.y),
        runtime.G1.parseAffine(value.lagrange_KL),
      ]),
    },
    {
      type: BinarySectionType.CrsG2,
      encoding: BinarySectionEncoding.FfjsG2Affine192,
      label: "sigma.g2",
      elementCount: 10,
      elementByteLength: 192,
      data: concatBytes([
        runtime.G2.parseAffine(value.H),
        runtime.G2.parseAffine(value.sigma_2.alpha),
        runtime.G2.parseAffine(value.sigma_2.alpha2),
        runtime.G2.parseAffine(value.sigma_2.alpha3),
        runtime.G2.parseAffine(value.sigma_2.alpha4),
        runtime.G2.parseAffine(value.sigma_2.gamma),
        runtime.G2.parseAffine(value.sigma_2.delta),
        runtime.G2.parseAffine(value.sigma_2.eta),
        runtime.G2.parseAffine(value.sigma_2.x),
        runtime.G2.parseAffine(value.sigma_2.y),
      ]),
    },
  ];
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

function joinG1Coordinate(part1: string, part2: string): string {
  return `0x${stripHex(part1).padStart(32, "0")}${stripHex(part2).padStart(64, "0")}`;
}

function stripHex(value: string): string {
  if (!/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new Error("Expected a 0x-prefixed hexadecimal string.");
  }

  return value.slice(2);
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}
