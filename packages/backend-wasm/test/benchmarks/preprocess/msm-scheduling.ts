import { readFile } from "node:fs/promises";
import path from "node:path";

import { decodeBinaryArtifactFile } from "../../../src/artifacts/binary/binary-artifact-file.js";
import { loadPreprocessInputFromBinaryInput } from "../../../src/preprocess/api/binary-input.js";
import { commitDensePreprocessPolynomial } from "../../../src/preprocess/commitments/preprocess-commitments.js";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { buildPermutationPolynomials } from "../../../src/runtime/polynomial/permutation-polynomials.js";

const fixtureRoot = path.resolve("fixtures/small/runtime");
const chunkPoints = 1 << 18;
const g1AffineBytes = 96;

type Mode = "sequential" | "concurrent";

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const [permutation, instance, preprocessCrs, verifierPreprocess] = await Promise.all([
    readBinary("permutation.bin"),
    readBinary("instance.bin"),
    readBinary("preprocess-crs.bin"),
    readBinary("verifier-preprocess.bin"),
  ]);
  const runtime = await createCurveRuntime();
  try {
    const input = await loadPreprocessInputFromBinaryInput(runtime, {
      permutation,
      instance,
      preprocessCrs,
    });
    const polynomials = await buildPermutationPolynomials(
      runtime.Fr,
      input.setup.l_D - input.setup.l,
      input.setup.s_max,
      input.permutation,
    );
    const expected = await readExpectedCommitments(verifierPreprocess);
    const started = performance.now();
    const commitments = mode === "sequential"
      ? await commitSequential(runtime, input.crs.xyPowers, polynomials)
      : await commitConcurrent(runtime, input.crs.xyPowers, polynomials);
    const elapsedMs = performance.now() - started;

    assertPointParity(runtime.G1.toAffine(commitments[0]), expected[0], "s0");
    assertPointParity(runtime.G1.toAffine(commitments[1]), expected[1], "s1");
    console.log(JSON.stringify({
      mode,
      parity: true,
      timingMs: elapsedMs,
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
    }));
  } finally {
    await runtime.terminate();
  }
}

async function commitSequential(
  runtime: Awaited<ReturnType<typeof createCurveRuntime>>,
  xyPowers: Uint8Array,
  polynomials: Awaited<ReturnType<typeof buildPermutationPolynomials>>,
): Promise<readonly [Uint8Array, Uint8Array]> {
  return [
    await commitDensePreprocessPolynomial(runtime, xyPowers, polynomials[0], chunkPoints),
    await commitDensePreprocessPolynomial(runtime, xyPowers, polynomials[1], chunkPoints),
  ];
}

async function commitConcurrent(
  runtime: Awaited<ReturnType<typeof createCurveRuntime>>,
  xyPowers: Uint8Array,
  polynomials: Awaited<ReturnType<typeof buildPermutationPolynomials>>,
): Promise<readonly [Uint8Array, Uint8Array]> {
  return await Promise.all([
    commitDensePreprocessPolynomial(runtime, xyPowers, polynomials[0], chunkPoints),
    commitDensePreprocessPolynomial(runtime, xyPowers, polynomials[1], chunkPoints),
  ]);
}

async function readExpectedCommitments(
  fileBytes: Uint8Array,
): Promise<readonly [Uint8Array, Uint8Array]> {
  const file = await decodeBinaryArtifactFile(fileBytes);
  const points = file.sections[0]?.data;
  if (points === undefined || points.byteLength < g1AffineBytes * 2) {
    throw new Error("Native preprocess fixture does not contain s0 and s1.");
  }
  return [
    points.subarray(0, g1AffineBytes),
    points.subarray(g1AffineBytes, g1AffineBytes * 2),
  ];
}

function assertPointParity(
  actual: Uint8Array,
  expected: Uint8Array,
  label: string,
): void {
  if (
    actual.byteLength !== expected.byteLength
    || actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(`${label} MSM scheduling benchmark commitment mismatch.`);
  }
}

async function readBinary(fileName: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(fixtureRoot, fileName)));
}

function parseMode(argv: readonly string[]): Mode {
  if (argv.length !== 2 || argv[0] !== "--mode") {
    throw new Error("Usage: msm-scheduling --mode <sequential|concurrent>");
  }
  const mode = argv[1];
  if (mode === "sequential" || mode === "concurrent") {
    return mode;
  }
  throw new Error(`Unsupported MSM scheduling benchmark mode: ${mode}`);
}

await main();
