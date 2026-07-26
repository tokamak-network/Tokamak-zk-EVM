import {
  buildDomainContext,
  collectChallenges,
  createCurveRuntime,
  evalLagrangeK0,
  lhsCopy,
  lhsCopyMsm,
  loadVerifierInputFromBinaryInput,
  verifyBinary,
  type CurveRuntime,
  type FieldElement,
  type VerifierBinaryInput,
} from "../../src/index.js";
import type { VerifierInput } from "../../src/verifier/protocol/verify-snark.js";

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
  const binaryFixture = await loadPreparedBinaryVerifierFixture();
  const runtime = await createCurveRuntime({ singleThread: true });

  try {
    const verifierInput = await loadVerifierInputFromBinaryInput(runtime, binaryFixture);
    const g1Timings =
      new URLSearchParams(window.location.search).get("benchG1") === "1"
        ? await checkAndBenchmarkG1CombinationCandidates(runtime, verifierInput)
        : undefined;
    const result = await verifyBinary(
      runtime,
      binaryFixture,
      {
        randomScalar: () => runtime.Fr.one,
      },
    );
    if (!result) {
      throw new Error("Browser verifier rejected the prepared runtime proof fixture.");
    }

    window.__tokamakVerifierResult = {
      status: "ok",
      valid: result,
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

async function loadPreparedBinaryVerifierFixture(): Promise<VerifierBinaryInput> {
  const [proof, instance, verifierPreprocess] = await Promise.all([
    fetchBinary("/fixtures/small/runtime/proof.bin"),
    fetchBinary("/fixtures/small/runtime/instance.bin"),
    fetchBinary("/fixtures/small/runtime/verifier-preprocess.bin"),
  ]);

  return { proof, instance, verifierPreprocess };
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
      "Prepare owner package outputs, run npm run fixtures:copy, then run npm run fixtures:prepare.",
    ].join(" ");
  }

  return `Failed to fetch ${path}: ${status}.`;
}
