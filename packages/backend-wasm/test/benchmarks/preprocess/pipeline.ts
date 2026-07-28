import { readFile } from "node:fs/promises";
import path from "node:path";

import { decodeBinaryArtifactFile } from "../../../src/artifacts/binary/binary-artifact-file.js";
import { loadPreprocessInputFromBinaryInput } from "../../../src/preprocess/api/binary-input.js";
import { preprocessSnark } from "../../../src/preprocess/protocol/preprocess-snark.js";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { preprocessSpeedCandidate } from "./pipeline-candidate.js";

const fixtureRoot = path.resolve("fixtures/small/runtime");

type Mode = "current" | "speed-candidate";

async function main(): Promise<void> {
  const processStarted = performance.now();
  const mode = parseMode(process.argv.slice(2));
  const [permutation, instance, preprocessCrs, expected] = await Promise.all([
    readBinary("permutation.bin"),
    readBinary("instance.bin"),
    readBinary("preprocess-crs.bin"),
    readBinary("verifier-preprocess.bin"),
  ]);
  const runtime = await createCurveRuntime();
  try {
    const preprocessStarted = performance.now();
    const input = await loadPreprocessInputFromBinaryInput(runtime, {
      permutation,
      instance,
      preprocessCrs,
    });
    const output = mode === "current"
      ? await preprocessSnark(runtime, input)
      : await preprocessSpeedCandidate(runtime, input);
    const preprocessMs = performance.now() - preprocessStarted;
    await assertPreprocessParity(output, expected);

    console.log(JSON.stringify({
      mode,
      parity: true,
      preprocessMs,
      processWallMs: performance.now() - processStarted,
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
    }));
  } finally {
    await runtime.terminate();
  }
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
    throw new Error("Preprocess pipeline benchmark output shape mismatch.");
  }
  for (let index = 0; index < actualData.byteLength; index += 1) {
    if (actualData[index] !== expectedData[index]) {
      throw new Error(`Preprocess pipeline benchmark parity mismatch at byte ${index}.`);
    }
  }
}

async function readBinary(fileName: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(fixtureRoot, fileName)));
}

function parseMode(argv: readonly string[]): Mode {
  if (argv.length !== 2 || argv[0] !== "--mode") {
    throw new Error("Usage: pipeline --mode <current|speed-candidate>");
  }
  const mode = argv[1];
  if (mode === "current" || mode === "speed-candidate") {
    return mode;
  }
  throw new Error(`Unsupported preprocess pipeline benchmark mode: ${mode}`);
}

await main();
