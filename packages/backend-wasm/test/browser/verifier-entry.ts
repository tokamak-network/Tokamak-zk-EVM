import {
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
  type CurveRuntime,
  type FieldElement,
  type RuntimeArtifactBundleManifest,
} from "../../src/index.js";
import type { VerifierInput } from "../../src/verifier/verify-snark.js";

interface FullProofFixtureExpected {
  readonly verification: {
    readonly nativeVerifierResult: boolean;
  };
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

interface BinaryVerifierFixture {
  readonly proofManifest: RuntimeArtifactBundleManifest;
  readonly setupManifest: RuntimeArtifactBundleManifest;
  readonly resolveFile: (path: string) => Promise<Uint8Array>;
}

window.__tokamakVerifierResult = { status: "pending" };

main().catch((error: unknown) => {
  window.__tokamakVerifierResult = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  };
});

async function main(): Promise<void> {
  const [binaryFixture, expected] = await Promise.all([
    loadPreparedBinaryVerifierFixture(),
    fetchJson<FullProofFixtureExpected>("/fixtures/small/expected/full-proof-small.json"),
  ]);
  const runtime = await createCurveRuntime({ singleThread: true });

  try {
    const verifierInput = await loadVerifierInputFromRuntimeBundles(
      runtime,
      binaryFixture.proofManifest,
      binaryFixture.setupManifest,
      binaryFixture.resolveFile,
    );
    const g1Timings =
      new URLSearchParams(window.location.search).get("benchG1") === "1"
        ? await checkAndBenchmarkG1CombinationCandidates(runtime, verifierInput)
        : undefined;
    const result = await verifyBinary(
      runtime,
      binaryFixture.proofManifest,
      binaryFixture.setupManifest,
      binaryFixture.resolveFile,
      {
        randomScalar: () => runtime.Fr.one,
      },
    );
    const valid = decodeVerifierBinaryResult(result);

    if (valid !== expected.verification.nativeVerifierResult) {
      throw new Error(
        `Browser verifier result mismatch: expected ${expected.verification.nativeVerifierResult}, got ${valid}.`,
      );
    }

    window.__tokamakVerifierResult = {
      status: "ok",
      valid,
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
    throw new Error(describePreparedFixtureFetchFailure(path, response.status));
  }

  return (await response.json()) as T;
}

async function loadPreparedBinaryVerifierFixture(): Promise<BinaryVerifierFixture> {
  const proofManifest = parseRuntimeArtifactBundleManifest(
    await fetchJson("/fixtures/small/runtime/verifier-proof-input/manifest.json"),
  );
  const setupManifest = parseRuntimeArtifactBundleManifest(
    await fetchJson("/fixtures/small/runtime/verifier-setup-input/manifest.json"),
  );
  const resolveFile = (artifactPath: string): Promise<Uint8Array> =>
    fetchBinary(`/fixtures/small/runtime/${artifactPath}`);

  return {
    proofManifest,
    setupManifest,
    resolveFile,
  };
}

async function fetchBinary(path: string): Promise<Uint8Array> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(describePreparedFixtureFetchFailure(path, response.status));
  }

  return new Uint8Array(await response.arrayBuffer());
}

function describePreparedFixtureFetchFailure(path: string, status: number): string {
  if (path.startsWith("/fixtures/small/runtime/")) {
    return [
      `Failed to fetch prepared verifier runtime fixture file ${path}: ${status}.`,
      "Prepare it in the owning package and run npm run fixtures:copy.",
    ].join(" ");
  }

  return `Failed to fetch ${path}: ${status}.`;
}
