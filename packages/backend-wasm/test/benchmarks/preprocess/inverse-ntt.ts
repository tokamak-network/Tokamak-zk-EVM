import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  decodeBinaryArtifactFile,
  requireBinaryArtifactSection,
} from "../../../src/artifacts/binary/binary-artifact-file.js";
import {
  BinarySectionEncoding,
  BinarySectionType,
} from "../../../src/artifacts/binary/binary-format.js";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import type { FieldRuntime } from "../../../src/runtime/field/field-types.js";
import { biNttBuffer } from "../../../src/runtime/polynomial/bivariate-polynomial-buffer.js";
import type { PermutationEntry } from "../../../src/runtime/polynomial/permutation-polynomials.js";

const fixturePath = path.resolve("fixtures/small/runtime/permutation.bin");
const xSize = 4096;
const ySize = 256;
const entryBytes = 16;
const measuredRuns = 3;

type Mode = "sequential" | "combined";

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const permutation = await readPermutation();
  const runtime = await createCurveRuntime();
  try {
    const evals = buildPermutationGrid(runtime.Fr, permutation);
    const expected = await inverseNttSequential(runtime.Fr, evals);
    const execute = mode === "sequential"
      ? () => inverseNttSequential(runtime.Fr, evals)
      : () => inverseNttCombined(runtime.Fr, evals);

    assertPairParity(await execute(), expected);
    const samples: number[] = [];
    for (let run = 0; run < measuredRuns; run += 1) {
      const started = performance.now();
      const actual = await execute();
      samples.push(performance.now() - started);
      assertPairParity(actual, expected);
    }

    console.log(JSON.stringify({
      mode,
      parity: true,
      measuredRuns,
      timingMs: {
        samples,
        mean: mean(samples),
        populationStandardDeviation: populationStandardDeviation(samples),
      },
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
    }));
  } finally {
    await runtime.terminate();
  }
}

async function inverseNttSequential(
  field: FieldRuntime,
  evals: readonly [Uint8Array, Uint8Array],
): Promise<readonly [Uint8Array, Uint8Array]> {
  return [
    await biNttBuffer(field, evals[0], xSize, ySize, "inverse"),
    await biNttBuffer(field, evals[1], xSize, ySize, "inverse"),
  ];
}

async function inverseNttCombined(
  field: FieldRuntime,
  evals: readonly [Uint8Array, Uint8Array],
): Promise<readonly [Uint8Array, Uint8Array]> {
  const polynomialBytes = xSize * ySize * field.byteLength;
  const combined = concatBuffers(evals);
  const yTransformed = await field.batchFftBuffer(combined, ySize, "inverse");
  const transposed = concatBuffers([
    transpose(
      yTransformed.subarray(0, polynomialBytes),
      xSize,
      ySize,
      field.byteLength,
    ),
    transpose(
      yTransformed.subarray(polynomialBytes),
      xSize,
      ySize,
      field.byteLength,
    ),
  ]);
  const xTransformed = await field.batchFftBuffer(transposed, xSize, "inverse");
  return [
    transpose(
      xTransformed.subarray(0, polynomialBytes),
      ySize,
      xSize,
      field.byteLength,
    ),
    transpose(
      xTransformed.subarray(polynomialBytes),
      ySize,
      xSize,
      field.byteLength,
    ),
  ];
}

function buildPermutationGrid(
  field: FieldRuntime,
  permutation: readonly PermutationEntry[],
): readonly [Uint8Array, Uint8Array] {
  const xPowers = powerTable(field, field.rootOfUnity(xSize), xSize);
  const yPowers = powerTable(field, field.rootOfUnity(ySize), ySize);
  const rowBytes = ySize * field.byteLength;
  const s0 = field.createZeroBuffer(xSize * ySize);
  const s1 = field.createZeroBuffer(xSize * ySize);
  const yRow = field.concat(yPowers);

  for (let row = 0; row < xSize; row += 1) {
    const rowOffset = row * rowBytes;
    const xValue = xPowers[row];
    for (let col = 0; col < ySize; col += 1) {
      s0.set(xValue, rowOffset + col * field.byteLength);
    }
    s1.set(yRow, rowOffset);
  }
  for (const entry of permutation) {
    const offset = (entry.row * ySize + entry.col) * field.byteLength;
    s0.set(xPowers[entry.X], offset);
    s1.set(yPowers[entry.Y], offset);
  }
  return [s0, s1];
}

function transpose(
  values: Uint8Array,
  sourceRows: number,
  sourceColumns: number,
  elementBytes: number,
): Uint8Array {
  const output = new Uint8Array(values.byteLength);
  for (let row = 0; row < sourceRows; row += 1) {
    for (let column = 0; column < sourceColumns; column += 1) {
      const source = (row * sourceColumns + column) * elementBytes;
      const target = (column * sourceRows + row) * elementBytes;
      output.set(values.subarray(source, source + elementBytes), target);
    }
  }
  return output;
}

function concatBuffers(buffers: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(
    buffers.reduce((total, buffer) => total + buffer.byteLength, 0),
  );
  let offset = 0;
  for (const buffer of buffers) {
    output.set(buffer, offset);
    offset += buffer.byteLength;
  }
  return output;
}

function powerTable(
  field: FieldRuntime,
  base: Uint8Array,
  length: number,
): readonly Uint8Array[] {
  const output = Array.from({ length }, () => field.one);
  for (let index = 1; index < length; index += 1) {
    output[index] = field.mul(output[index - 1], base);
  }
  return output;
}

async function readPermutation(): Promise<readonly PermutationEntry[]> {
  const file = await decodeBinaryArtifactFile(new Uint8Array(await readFile(fixturePath)));
  const bytes = requireBinaryArtifactSection(file, {
    type: BinarySectionType.Permutation,
    encoding: BinarySectionEncoding.Bytes,
    label: "permutation.entries",
  }).data;
  if (bytes.byteLength % entryBytes !== 0) {
    throw new Error("Permutation benchmark input byte length must be divisible by 16.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const output: PermutationEntry[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += entryBytes) {
    output.push({
      row: view.getUint32(offset, true),
      col: view.getUint32(offset + 4, true),
      X: view.getUint32(offset + 8, true),
      Y: view.getUint32(offset + 12, true),
    });
  }
  return output;
}

function assertPairParity(
  actual: readonly [Uint8Array, Uint8Array],
  expected: readonly [Uint8Array, Uint8Array],
): void {
  assertBytesEqual(actual[0], expected[0], "s0");
  assertBytesEqual(actual[1], expected[1], "s1");
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (actual.byteLength !== expected.byteLength) {
    throw new Error(`${label} inverse-NTT byte length mismatch.`);
  }
  for (let index = 0; index < actual.byteLength; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(`${label} inverse-NTT mismatch at byte ${index}.`);
    }
  }
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function populationStandardDeviation(values: readonly number[]): number {
  const average = mean(values);
  return Math.sqrt(
    values.reduce((total, value) => total + (value - average) ** 2, 0)
      / values.length,
  );
}

function parseMode(argv: readonly string[]): Mode {
  if (argv.length !== 2 || argv[0] !== "--mode") {
    throw new Error("Usage: inverse-ntt --mode <sequential|combined>");
  }
  const mode = argv[1];
  if (mode === "sequential" || mode === "combined") {
    return mode;
  }
  throw new Error(`Unsupported inverse-NTT benchmark mode: ${mode}`);
}

await main();
