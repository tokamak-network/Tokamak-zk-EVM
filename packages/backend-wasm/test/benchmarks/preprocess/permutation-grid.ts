import { readFile } from "node:fs/promises";
import path from "node:path";

import { getCurveFromName } from "ffjavascript";

import {
  decodeBinaryArtifactFile,
  requireBinaryArtifactSection,
} from "../../../src/artifacts/binary/binary-artifact-file.js";
import {
  BinarySectionEncoding,
  BinarySectionType,
} from "../../../src/artifacts/binary/binary-format.js";
import type {
  FfCurve,
  FfField,
  FfWorkerCommand,
} from "../../../src/runtime/curve/curve.js";
import { createFieldRuntime } from "../../../src/runtime/field/field-runtime.js";
import { installLinearBatchPlugin } from "../../../src/runtime/field/linear-batch-plugin.js";
import type { WasmModuleBuilder } from "../../../src/runtime/field/kernel-builder-types.js";
import type { FieldRuntime } from "../../../src/runtime/field/field-types.js";
import type { PermutationEntry } from "../../../src/runtime/polynomial/permutation-polynomials.js";

const fixturePath = path.resolve("fixtures/small/runtime/permutation.bin");
const mI = 4096;
const sMax = 256;
const fieldBytes = 32;
const permutationEntryBytes = 16;
const measuredRuns = 5;
const kernelName = "tokamak_bench_permutationGrid";

type Mode = "baseline" | "row-template" | "wasm-kernel";

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const permutationBytes = await readPermutationBytes();
  const permutation = parsePermutation(permutationBytes);
  const raw = await getBenchmarkCurve();
  const field = createFieldRuntime(raw.Fr);
  try {
    const xPowers = powerTable(field, field.rootOfUnity(mI), mI);
    const yPowers = powerTable(field, field.rootOfUnity(sMax), sMax);
    const expected = buildGridBaseline(field, xPowers, yPowers, permutation);
    const execute = createExecution(
      mode,
      raw.Fr,
      field,
      xPowers,
      yPowers,
      permutation,
      permutationBytes,
    );

    assertGridParity(await execute(), expected);
    const samples: number[] = [];
    for (let run = 0; run < measuredRuns; run += 1) {
      const started = performance.now();
      const actual = await execute();
      samples.push(performance.now() - started);
      assertGridParity(actual, expected);
    }

    console.log(JSON.stringify({
      mode,
      parity: true,
      measuredRuns,
      timingMs: {
        samples,
        median: median(samples),
      },
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
    }));
  } finally {
    await raw.terminate?.();
  }
}

function createExecution(
  mode: Mode,
  rawField: FfField,
  field: FieldRuntime,
  xPowers: readonly Uint8Array[],
  yPowers: readonly Uint8Array[],
  permutation: readonly PermutationEntry[],
  permutationBytes: Uint8Array,
): () => Promise<readonly [Uint8Array, Uint8Array]> {
  if (mode === "baseline") {
    return async () => buildGridBaseline(field, xPowers, yPowers, permutation);
  }
  if (mode === "row-template") {
    return async () => buildGridRowTemplate(field, xPowers, yPowers, permutation);
  }

  const xPowerBuffer = field.concat(xPowers);
  const yPowerBuffer = field.concat(yPowers);
  return async () => buildGridWasm(rawField, xPowerBuffer, yPowerBuffer, permutationBytes);
}

function buildGridBaseline(
  field: FieldRuntime,
  xPowers: readonly Uint8Array[],
  yPowers: readonly Uint8Array[],
  permutation: readonly PermutationEntry[],
): readonly [Uint8Array, Uint8Array] {
  const rowBytes = sMax * field.byteLength;
  const s0 = field.createZeroBuffer(mI * sMax);
  const s1 = field.createZeroBuffer(mI * sMax);
  const yRow = field.concat(yPowers);
  for (let row = 0; row < mI; row += 1) {
    const rowOffset = row * rowBytes;
    const xValue = xPowers[row];
    for (let col = 0; col < sMax; col += 1) {
      s0.set(xValue, rowOffset + col * field.byteLength);
    }
    s1.set(yRow, rowOffset);
  }
  applyPermutation(s0, s1, xPowers, yPowers, permutation);
  return [s0, s1];
}

function buildGridRowTemplate(
  field: FieldRuntime,
  xPowers: readonly Uint8Array[],
  yPowers: readonly Uint8Array[],
  permutation: readonly PermutationEntry[],
): readonly [Uint8Array, Uint8Array] {
  const rowBytes = sMax * field.byteLength;
  const s0 = field.createZeroBuffer(mI * sMax);
  const s1 = field.createZeroBuffer(mI * sMax);
  const xRow = new Uint8Array(rowBytes);
  const yRow = field.concat(yPowers);
  for (let row = 0; row < mI; row += 1) {
    repeatElement(xRow, xPowers[row]);
    const rowOffset = row * rowBytes;
    s0.set(xRow, rowOffset);
    s1.set(yRow, rowOffset);
  }
  applyPermutation(s0, s1, xPowers, yPowers, permutation);
  return [s0, s1];
}

async function buildGridWasm(
  field: FfField,
  xPowers: Uint8Array,
  yPowers: Uint8Array,
  permutation: Uint8Array,
): Promise<readonly [Uint8Array, Uint8Array]> {
  const outputBytes = mI * sMax * fieldBytes;
  const task: FfWorkerCommand[] = [
    { cmd: "ALLOCSET", var: 0, buff: xPowers },
    { cmd: "ALLOCSET", var: 1, buff: yPowers },
    { cmd: "ALLOCSET", var: 2, buff: permutation },
    { cmd: "ALLOC", var: 3, len: outputBytes },
    { cmd: "ALLOC", var: 4, len: outputBytes },
    {
      cmd: "CALL",
      fnName: kernelName,
      params: [
        { var: 0 },
        { var: 1 },
        { var: 2 },
        { val: permutation.byteLength / permutationEntryBytes },
        { val: mI },
        { val: sMax },
        { var: 3 },
        { var: 4 },
      ],
    },
    { cmd: "GET", out: 0, var: 3, len: outputBytes },
    { cmd: "GET", out: 1, var: 4, len: outputBytes },
  ];
  const result = await field.tm.queueAction(task);
  const s0 = result[0];
  const s1 = result[1];
  if (s0 === undefined || s1 === undefined) {
    throw new Error("Permutation-grid WASM benchmark returned incomplete output.");
  }
  return [s0, s1];
}

function applyPermutation(
  s0: Uint8Array,
  s1: Uint8Array,
  xPowers: readonly Uint8Array[],
  yPowers: readonly Uint8Array[],
  permutation: readonly PermutationEntry[],
): void {
  for (const entry of permutation) {
    const byteOffset = (entry.row * sMax + entry.col) * fieldBytes;
    s0.set(xPowers[entry.X], byteOffset);
    s1.set(yPowers[entry.Y], byteOffset);
  }
}

function repeatElement(target: Uint8Array, element: Uint8Array): void {
  target.set(element, 0);
  let filled = element.byteLength;
  while (filled < target.byteLength) {
    const copyLength = Math.min(filled, target.byteLength - filled);
    target.set(target.subarray(0, copyLength), filled);
    filled += copyLength;
  }
}

function installBenchmarkPlugin(module: WasmModuleBuilder): void {
  installLinearBatchPlugin(module);
  const fn = module.addFunction(kernelName);
  fn.addParam("pX", "i32");
  fn.addParam("pY", "i32");
  fn.addParam("pPermutation", "i32");
  fn.addParam("permutationCount", "i32");
  fn.addParam("xSize", "i32");
  fn.addParam("ySize", "i32");
  fn.addParam("pS0", "i32");
  fn.addParam("pS1", "i32");
  fn.addLocal("row", "i32");
  fn.addLocal("col", "i32");
  fn.addLocal("index", "i32");
  fn.addLocal("offset", "i32");
  fn.addLocal("entry", "i32");
  const code = fn.getCodeBuilder();
  const elementBytes = code.i32_const(fieldBytes);
  fn.addCode(
    code.setLocal("row", code.i32_const(0)),
    code.block(
      code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("row"), code.getLocal("xSize"))),
        code.setLocal("col", code.i32_const(0)),
        code.block(
          code.loop(
            code.br_if(1, code.i32_eq(code.getLocal("col"), code.getLocal("ySize"))),
            code.setLocal(
              "offset",
              code.i32_mul(
                code.i32_add(
                  code.i32_mul(code.getLocal("row"), code.getLocal("ySize")),
                  code.getLocal("col"),
                ),
                elementBytes,
              ),
            ),
            code.call(
              "frm_copy",
              code.i32_add(
                code.getLocal("pX"),
                code.i32_mul(code.getLocal("row"), elementBytes),
              ),
              code.i32_add(code.getLocal("pS0"), code.getLocal("offset")),
            ),
            code.call(
              "frm_copy",
              code.i32_add(
                code.getLocal("pY"),
                code.i32_mul(code.getLocal("col"), elementBytes),
              ),
              code.i32_add(code.getLocal("pS1"), code.getLocal("offset")),
            ),
            code.setLocal("col", code.i32_add(code.getLocal("col"), code.i32_const(1))),
            code.br(0),
          ),
        ),
        code.setLocal("row", code.i32_add(code.getLocal("row"), code.i32_const(1))),
        code.br(0),
      ),
    ),
    code.setLocal("index", code.i32_const(0)),
    code.block(
      code.loop(
        code.br_if(
          1,
          code.i32_eq(code.getLocal("index"), code.getLocal("permutationCount")),
        ),
        code.setLocal(
          "entry",
          code.i32_add(
            code.getLocal("pPermutation"),
            code.i32_mul(code.getLocal("index"), code.i32_const(permutationEntryBytes)),
          ),
        ),
        code.setLocal(
          "offset",
          code.i32_mul(
            code.i32_add(
              code.i32_mul(code.i32_load(code.getLocal("entry")), code.getLocal("ySize")),
              code.i32_load(code.i32_add(code.getLocal("entry"), code.i32_const(4))),
            ),
            elementBytes,
          ),
        ),
        code.call(
          "frm_copy",
          code.i32_add(
            code.getLocal("pX"),
            code.i32_mul(
              code.i32_load(code.i32_add(code.getLocal("entry"), code.i32_const(8))),
              elementBytes,
            ),
          ),
          code.i32_add(code.getLocal("pS0"), code.getLocal("offset")),
        ),
        code.call(
          "frm_copy",
          code.i32_add(
            code.getLocal("pY"),
            code.i32_mul(
              code.i32_load(code.i32_add(code.getLocal("entry"), code.i32_const(12))),
              elementBytes,
            ),
          ),
          code.i32_add(code.getLocal("pS1"), code.getLocal("offset")),
        ),
        code.setLocal("index", code.i32_add(code.getLocal("index"), code.i32_const(1))),
        code.br(0),
      ),
    ),
  );
  module.exportFunction(kernelName);
}

async function getBenchmarkCurve(): Promise<FfCurve> {
  return await getCurveFromName(
    "bls12381",
    false,
    installBenchmarkPlugin,
  ) as FfCurve;
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

async function readPermutationBytes(): Promise<Uint8Array> {
  const file = await decodeBinaryArtifactFile(new Uint8Array(await readFile(fixturePath)));
  return requireBinaryArtifactSection(file, {
    type: BinarySectionType.Permutation,
    encoding: BinarySectionEncoding.Bytes,
    label: "permutation.entries",
  }).data;
}

function parsePermutation(bytes: Uint8Array): readonly PermutationEntry[] {
  if (bytes.byteLength % permutationEntryBytes !== 0) {
    throw new Error("Permutation benchmark input byte length must be divisible by 16.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const output: PermutationEntry[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += permutationEntryBytes) {
    output.push({
      row: view.getUint32(offset, true),
      col: view.getUint32(offset + 4, true),
      X: view.getUint32(offset + 8, true),
      Y: view.getUint32(offset + 12, true),
    });
  }
  return output;
}

function assertGridParity(
  actual: readonly [Uint8Array, Uint8Array],
  expected: readonly [Uint8Array, Uint8Array],
): void {
  assertBytesEqual(actual[0], expected[0], "s0");
  assertBytesEqual(actual[1], expected[1], "s1");
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (actual.byteLength !== expected.byteLength) {
    throw new Error(`${label} grid byte length mismatch.`);
  }
  for (let index = 0; index < actual.byteLength; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(`${label} grid mismatch at byte ${index}.`);
    }
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function parseMode(argv: readonly string[]): Mode {
  if (argv.length !== 2 || argv[0] !== "--mode") {
    throw new Error(
      "Usage: permutation-grid --mode <baseline|row-template|wasm-kernel>",
    );
  }
  const mode = argv[1];
  if (mode === "baseline" || mode === "row-template" || mode === "wasm-kernel") {
    return mode;
  }
  throw new Error(`Unsupported permutation-grid benchmark mode: ${mode}`);
}

await main();
