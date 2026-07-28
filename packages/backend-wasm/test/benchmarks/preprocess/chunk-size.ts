import { readFile } from "node:fs/promises";
import path from "node:path";

import { decodeBinaryArtifactFile } from "../../../src/artifacts/binary/binary-artifact-file.js";
import { loadPreprocessInputFromBinaryInput } from "../../../src/preprocess/api/binary-input.js";
import { commitDensePreprocessPolynomial } from "../../../src/preprocess/commitments/preprocess-commitments.js";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { buildPermutationPolynomials } from "../../../src/runtime/polynomial/permutation-polynomials.js";

const fixtureRoot = path.resolve("fixtures/small/runtime");
const g1AffineBytes = 96;
const minChunkSizeExponent = 10;
const maxChunkSizeExponent = 19;

async function main(): Promise<void> {
  const processStarted = performance.now();
  const chunkSizeExponent = parseChunkSizeExponent(process.argv.slice(2));
  const chunkPoints = 2 ** chunkSizeExponent;
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
    const operationStarted = performance.now();
    const s0 = await commitDensePreprocessPolynomial(
      runtime,
      input.crs.xyPowers,
      polynomials[0],
      chunkPoints,
    );
    const s1 = await commitDensePreprocessPolynomial(
      runtime,
      input.crs.xyPowers,
      polynomials[1],
      chunkPoints,
    );
    const operationMs = performance.now() - operationStarted;

    assertPointParity(runtime.G1.toAffine(s0), expected[0], "s0");
    assertPointParity(runtime.G1.toAffine(s1), expected[1], "s1");
    console.log(JSON.stringify({
      chunkSizeExponent,
      chunkPoints,
      parity: true,
      operationMs,
      processWallMs: performance.now() - processStarted,
      temporaryBytes: Math.min(chunkPoints, polynomials[0].xSize * polynomials[0].ySize)
        * runtime.Fr.byteLength,
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
    }));
  } finally {
    await runtime.terminate();
  }
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

function assertPointParity(actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (
    actual.byteLength !== expected.byteLength
    || actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(`${label} chunk-size benchmark commitment mismatch.`);
  }
}

async function readBinary(fileName: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(fixtureRoot, fileName)));
}

function parseChunkSizeExponent(argv: readonly string[]): number {
  if (argv.length !== 2 || argv[0] !== "--chunk-size-exponent") {
    throw new Error(
      "Usage: chunk-size --chunk-size-exponent <10..19>",
    );
  }
  const exponent = Number(argv[1]);
  if (
    !Number.isInteger(exponent)
    || exponent < minChunkSizeExponent
    || exponent > maxChunkSizeExponent
  ) {
    throw new Error(
      `Chunk-size exponent must be an integer from ${minChunkSizeExponent} through ${maxChunkSizeExponent}.`,
    );
  }
  return exponent;
}

await main();
