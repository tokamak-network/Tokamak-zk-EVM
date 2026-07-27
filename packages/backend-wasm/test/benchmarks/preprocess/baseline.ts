import { readFile } from "node:fs/promises";
import path from "node:path";

import { decodeBinaryArtifactFile } from "../../../src/artifacts/binary/binary-artifact-file.js";
import { loadPreprocessInputFromBinaryInput } from "../../../src/preprocess/api/binary-input.js";
import { createPreprocessOutput } from "../../../src/preprocess/api/output.js";
import {
  commitDensePreprocessPolynomial,
  commitFunctionInstance,
} from "../../../src/preprocess/commitments/preprocess-commitments.js";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { buildPermutationPolynomials } from "../../../src/runtime/polynomial/permutation-polynomials.js";

const fixtureRoot = path.resolve("fixtures/small/runtime");
const chunkPoints = 1 << 18;

async function main(): Promise<void> {
  const totalStarted = performance.now();
  const readStarted = performance.now();
  const [permutation, instance, preprocessCrs, expected] = await Promise.all([
    readBinary("permutation.bin"),
    readBinary("instance.bin"),
    readBinary("preprocess-crs.bin"),
    readBinary("verifier-preprocess.bin"),
  ]);
  const fixtureReadMs = performance.now() - readStarted;
  const runtimeStarted = performance.now();
  const runtime = await createCurveRuntime();
  const runtimeInstallMs = performance.now() - runtimeStarted;
  try {
    const inputStarted = performance.now();
    const input = await loadPreprocessInputFromBinaryInput(runtime, {
      permutation,
      instance,
      preprocessCrs,
    });
    const inputDecodeMs = performance.now() - inputStarted;
    const mI = input.setup.l_D - input.setup.l;
    const polynomialStarted = performance.now();
    const [s0XY, s1XY] = await buildPermutationPolynomials(
      runtime.Fr,
      mI,
      input.setup.s_max,
      input.permutation,
    );
    const polynomialMs = performance.now() - polynomialStarted;
    const s0Started = performance.now();
    const s0 = await commitDensePreprocessPolynomial(
      runtime,
      input.crs.xyPowers,
      s0XY,
      chunkPoints,
    );
    const s0CommitmentMs = performance.now() - s0Started;
    const s1Started = performance.now();
    const s1 = await commitDensePreprocessPolynomial(
      runtime,
      input.crs.xyPowers,
      s1XY,
      chunkPoints,
    );
    const s1CommitmentMs = performance.now() - s1Started;
    const oPubFixStarted = performance.now();
    const oPubFix = await commitFunctionInstance(
      runtime,
      input.crs.gammaInvOInst,
      input.functionInstance,
    );
    const oPubFixMs = performance.now() - oPubFixStarted;
    const outputStarted = performance.now();
    const output = await createPreprocessOutput(runtime, s0, s1, oPubFix);
    const outputMs = performance.now() - outputStarted;
    const parityStarted = performance.now();
    await assertPreprocessParity(output, expected);
    const parityCheckMs = performance.now() - parityStarted;
    const preprocessMs = (
      inputDecodeMs
      + polynomialMs
      + s0CommitmentMs
      + s1CommitmentMs
      + oPubFixMs
      + outputMs
    );

    console.log(JSON.stringify({
      parity: true,
      chunkPoints,
      environment: {
        platform: process.platform,
        architecture: process.arch,
        node: process.version,
      },
      timingMs: {
        fixtureRead: fixtureReadMs,
        runtimeInstall: runtimeInstallMs,
        inputDecode: inputDecodeMs,
        permutationPolynomials: polynomialMs,
        s0Commitment: s0CommitmentMs,
        s1Commitment: s1CommitmentMs,
        oPubFix: oPubFixMs,
        output: outputMs,
        preprocess: preprocessMs,
        parityCheck: parityCheckMs,
        processWall: performance.now() - totalStarted,
      },
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
    }));
  } finally {
    await runtime.terminate();
  }
}

async function readBinary(fileName: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(fixtureRoot, fileName)));
}

async function assertPreprocessParity(
  actual: Uint8Array,
  expected: Uint8Array,
): Promise<void> {
  const [actualFile, expectedFile] = await Promise.all([
    decodeBinaryArtifactFile(actual),
    decodeBinaryArtifactFile(expected),
  ]);
  const actualData = actualFile.sections[0]?.data;
  const expectedData = expectedFile.sections[0]?.data;
  if (
    actualData === undefined
    || expectedData === undefined
    || actualData.byteLength !== expectedData.byteLength
  ) {
    throw new Error("Preprocess benchmark output shape mismatch.");
  }
  for (let index = 0; index < actualData.byteLength; index += 1) {
    if (actualData[index] !== expectedData[index]) {
      throw new Error(`Preprocess benchmark parity mismatch at byte ${index}.`);
    }
  }
}

await main();
