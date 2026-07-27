import { readFile } from "node:fs/promises";
import path from "node:path";

import { decodeBinaryArtifactFile } from "../../../src/artifacts/binary/binary-artifact-file.js";
import { loadPreprocessInputFromBinaryInput } from "../../../src/preprocess/api/binary-input.js";
import { preprocessSnark } from "../../../src/preprocess/protocol/preprocess-snark.js";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";

const fixtureRoot = path.resolve("fixtures/small/runtime");

async function main(): Promise<void> {
  const [permutation, instance, preprocessCrs, expected] = await Promise.all([
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
    const started = performance.now();
    const actual = await preprocessSnark(runtime, input);
    const elapsedMs = performance.now() - started;
    const [actualFile, expectedFile] = await Promise.all([
      decodeBinaryArtifactFile(actual),
      decodeBinaryArtifactFile(expected),
    ]);
    const actualPoints = actualFile.sections[0]?.data;
    const expectedPoints = expectedFile.sections[0]?.data;
    if (actualPoints === undefined || expectedPoints === undefined) {
      throw new Error("Preprocess fixture output is missing preprocess.g1.");
    }
    assertBytesEqual(actualPoints, expectedPoints);
    console.log(JSON.stringify({
      parity: true,
      elapsedMs,
      points: actualPoints.byteLength / 96,
    }));
  } finally {
    await runtime.terminate();
  }
}

async function readBinary(fileName: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(fixtureRoot, fileName)));
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array): void {
  if (actual.byteLength !== expected.byteLength) {
    throw new Error(
      `Preprocess point byte length mismatch: expected ${expected.byteLength}, got ${actual.byteLength}.`,
    );
  }
  for (let index = 0; index < actual.byteLength; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(`Preprocess point mismatch at byte ${index}.`);
    }
  }
}

await main();
