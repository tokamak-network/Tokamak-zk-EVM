import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { decodeBinaryArtifactFile } from "../../../src/artifacts/binary/binary-artifact-file.js";
import { convertWitness } from "../../../src/converter/conversion/witness-converter.js";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { parseProverPlacementVariables } from "../../../src/prover/api/binary-input.js";
import {
  convertWitnessDirect,
  flatPlacementVariableAt,
  loadFlatPlacementVariables,
} from "./witness-candidates.js";

type BenchmarkCase =
  | "convert-baseline"
  | "convert-direct"
  | "load-baseline"
  | "load-flat";

async function main(): Promise<void> {
  const benchmarkCase = parseBenchmarkCase(process.argv[2]);
  const sourcePath = process.argv[3];
  const expectedPath = process.argv[4];
  if (sourcePath === undefined || expectedPath === undefined) {
    throw new Error(
      "Usage: benchmark-case <case> <placementVariables.json> <witness.bin>",
    );
  }

  const result = benchmarkCase === "convert-baseline" || benchmarkCase === "convert-direct"
    ? await benchmarkConversion(benchmarkCase, sourcePath, expectedPath)
    : await benchmarkLoading(benchmarkCase, expectedPath);
  console.log(JSON.stringify({ benchmarkCase, ...result }));
}

async function benchmarkConversion(
  benchmarkCase: "convert-baseline" | "convert-direct",
  sourcePath: string,
  expectedPath: string,
): Promise<Record<string, number | boolean>> {
  const source = JSON.parse(await readFile(sourcePath, "utf8")) as unknown;
  let artifact: Uint8Array;
  const startedAt = performance.now();
  if (benchmarkCase === "convert-baseline") {
    artifact = await convertWitness(source);
  } else {
    const runtime = await createCurveRuntime();
    try {
      artifact = await convertWitnessDirect(runtime, source);
    } finally {
      await runtime.terminate();
    }
  }
  const elapsedMs = performance.now() - startedAt;
  const expected = new Uint8Array(await readFile(expectedPath));
  assertBytesEqual(artifact, expected, "witness artifact");

  return {
    elapsedMs,
    artifactBytes: artifact.byteLength,
    parity: true,
  };
}

async function benchmarkLoading(
  benchmarkCase: "load-baseline" | "load-flat",
  expectedPath: string,
): Promise<Record<string, number | boolean>> {
  const artifact = await decodeBinaryArtifactFile(
    new Uint8Array(await readFile(expectedPath)),
  );
  const runtime = await createCurveRuntime();
  try {
    const startedAt = performance.now();
    if (benchmarkCase === "load-baseline") {
      const placements = parseProverPlacementVariables(runtime, artifact);
      const elapsedMs = performance.now() - startedAt;
      const checksum = checksumBaseline(placements);
      const variableCount = placements.reduce(
        (count, placement) => count + placement.variables.length,
        0,
      );
      return {
        elapsedMs,
        placementCount: placements.length,
        variableCount,
        retainedVariableViews: variableCount,
        retainedPlacementVariableArrays: placements.length,
        checksum,
      };
    }

    const placements = loadFlatPlacementVariables(artifact, runtime.Fr.byteLength);
    const elapsedMs = performance.now() - startedAt;
    const checksum = checksumFlat(placements);
    return {
      elapsedMs,
      placementCount: placements.subcircuitIds.length,
      variableCount: placements.variableOffsets.at(-1) ?? 0,
      retainedVariableViews: 1,
      retainedPlacementVariableArrays: 0,
      checksum,
    };
  } finally {
    await runtime.terminate();
  }
}

function checksumBaseline(
  placements: ReturnType<typeof parseProverPlacementVariables>,
): number {
  let checksum = 0;
  for (const placement of placements) {
    checksum = (checksum + placement.subcircuitId) >>> 0;
    for (const variable of placement.variables) {
      checksum = (checksum + variable[0] + variable[variable.byteLength - 1]) >>> 0;
    }
  }
  return checksum;
}

function checksumFlat(
  placements: ReturnType<typeof loadFlatPlacementVariables>,
): number {
  let checksum = 0;
  for (
    let placementIndex = 0;
    placementIndex < placements.subcircuitIds.length;
    placementIndex += 1
  ) {
    checksum = (checksum + placements.subcircuitIds[placementIndex]) >>> 0;
    const variableCount = placements.variableOffsets[placementIndex + 1]
      - placements.variableOffsets[placementIndex];
    for (let localIndex = 0; localIndex < variableCount; localIndex += 1) {
      const variable = flatPlacementVariableAt(placements, placementIndex, localIndex);
      checksum = (checksum + variable[0] + variable[variable.byteLength - 1]) >>> 0;
    }
  }
  return checksum;
}

function parseBenchmarkCase(value: string | undefined): BenchmarkCase {
  if (
    value === "convert-baseline"
    || value === "convert-direct"
    || value === "load-baseline"
    || value === "load-flat"
  ) {
    return value;
  }
  throw new Error(`Unsupported witness benchmark case: ${value ?? "missing"}.`);
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (
    actual.byteLength !== expected.byteLength
    || Buffer.compare(
      Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength),
      Buffer.from(expected.buffer, expected.byteOffset, expected.byteLength),
    ) !== 0
  ) {
    throw new Error(`${label} mismatch.`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
