import { getCurveFromName } from "ffjavascript";

import {
  type FfCurve,
  type FfField,
  type FfWorkerCommand,
} from "../../../src/core/curve/curve.js";
import { createFieldRuntime, type FieldRuntime } from "../../../src/core/field/field.js";
import {
  installLinearBatchPlugin,
  type WasmModuleBuilder,
} from "../../../src/core/field/linear-batch-plugin.js";
import { createG1Runtime, type G1Runtime } from "../../../src/core/group/group.js";

const G1_AFFINE_BYTES = 96;
const SPARSE_COMPACT = "tokamak_bench_sparseCompact";

interface BenchmarkWasmCodeBuilder {
  i32_const(value: number): unknown;
  getLocal(name: string): unknown;
  setLocal(name: string, value: unknown): unknown;
  i32_add(left: unknown, right: unknown): unknown;
  i32_mul(left: unknown, right: unknown): unknown;
  i32_eq(left: unknown, right: unknown): unknown;
  i32_eqz(value: unknown): unknown;
  i32_or(left: unknown, right: unknown): unknown;
  i32_load(pointer: unknown, offset?: number, align?: number): unknown;
  i32_store(pointer: unknown, offsetOrValue: unknown, align?: number, value?: unknown): unknown;
  if(condition: unknown, thenCode: unknown): unknown;
  call(name: string, ...params: unknown[]): unknown;
  br(depth: number): unknown;
  br_if(depth: number, condition: unknown): unknown;
  block(code: unknown): unknown;
  loop(...code: unknown[]): unknown;
}

interface BenchmarkFunctionBuilder {
  addParam(name: string, type: "i32"): void;
  addLocal(name: string, type: "i32"): void;
  getCodeBuilder(): BenchmarkWasmCodeBuilder;
  addCode(...code: unknown[]): void;
}

interface BenchmarkModuleBuilder {
  addFunction(name: string): BenchmarkFunctionBuilder;
  exportFunction(name: string): void;
}

export interface CompactionBenchmarkRuntime {
  readonly Fr: FieldRuntime;
  readonly G1: G1Runtime;
  readonly rawFr: FfField;
  readonly workerCount: number;
  terminate(): Promise<void>;
}

export interface CompactedInput {
  readonly bases: Uint8Array;
  readonly montgomeryScalars: Uint8Array;
  readonly nonzeroCount: number;
}

export async function createCompactionBenchmarkRuntime(
  singleThread: boolean,
): Promise<CompactionBenchmarkRuntime> {
  const raw = await getCurveFromName(
    "bls12381",
    singleThread,
    installSparseCompactionBenchmarkPlugin,
  ) as FfCurve;
  const Fr = createFieldRuntime(raw.Fr);
  return {
    Fr,
    G1: createG1Runtime(raw.G1, Fr),
    rawFr: raw.Fr,
    workerCount: raw.Fr.tm.concurrency,
    async terminate() {
      await raw.terminate?.();
    },
  };
}

export async function compactSparseSingleTask(
  field: FfField,
  bases: Uint8Array,
  montgomeryScalars: Uint8Array,
): Promise<CompactedInput> {
  assertInputs(field, bases, montgomeryScalars);
  const result = await field.tm.queueAction(buildCompactionTask(bases, montgomeryScalars, field.n8));
  return decodeTaskResult(result, bases.byteLength / G1_AFFINE_BYTES, field.n8);
}

export async function compactSparseWorkerShards(
  field: FfField,
  bases: Uint8Array,
  montgomeryScalars: Uint8Array,
): Promise<CompactedInput> {
  assertInputs(field, bases, montgomeryScalars);
  const elementCount = bases.byteLength / G1_AFFINE_BYTES;
  const ranges = splitRanges(elementCount, field.tm.concurrency);
  const results = await Promise.all(
    ranges.map(({ start, count }) => field.tm.queueAction(
      buildCompactionTask(
        bases.slice(start * G1_AFFINE_BYTES, (start + count) * G1_AFFINE_BYTES),
        montgomeryScalars.slice(start * field.n8, (start + count) * field.n8),
        field.n8,
      ),
    )),
  );
  const compacted = results.map((result, index) => decodeTaskResult(result, ranges[index].count, field.n8));
  const nonzeroCount = compacted.reduce((sum, item) => sum + item.nonzeroCount, 0);
  const compactBases = new Uint8Array(nonzeroCount * G1_AFFINE_BYTES);
  const compactScalars = new Uint8Array(nonzeroCount * field.n8);
  let outputIndex = 0;
  for (const item of compacted) {
    compactBases.set(item.bases, outputIndex * G1_AFFINE_BYTES);
    compactScalars.set(item.montgomeryScalars, outputIndex * field.n8);
    outputIndex += item.nonzeroCount;
  }
  return {
    bases: compactBases,
    montgomeryScalars: compactScalars,
    nonzeroCount,
  };
}

function installSparseCompactionBenchmarkPlugin(module: WasmModuleBuilder): void {
  installLinearBatchPlugin(module);
  buildSparseCompactionKernel(module as unknown as BenchmarkModuleBuilder);
}

function buildSparseCompactionKernel(module: BenchmarkModuleBuilder): void {
  const fn = module.addFunction(SPARSE_COMPACT);
  fn.addParam("pBases", "i32");
  fn.addParam("pScalars", "i32");
  fn.addParam("n", "i32");
  fn.addParam("pOutBases", "i32");
  fn.addParam("pOutScalars", "i32");
  fn.addParam("pCount", "i32");
  fn.addLocal("i", "i32");
  fn.addLocal("count", "i32");
  const code = fn.getCodeBuilder();
  const indexedPointer = (base: string, stride: number, index: string) =>
    code.i32_add(
      code.getLocal(base),
      code.i32_mul(code.getLocal(index), code.i32_const(stride)),
    );
  const scalarPointer = () => indexedPointer("pScalars", 32, "i");
  const basePointer = () => indexedPointer("pBases", G1_AFFINE_BYTES, "i");
  const outScalarPointer = () => indexedPointer("pOutScalars", 32, "count");
  const outBasePointer = () => indexedPointer("pOutBases", G1_AFFINE_BYTES, "count");
  const scalarWord = (index: number) => code.i32_load(scalarPointer(), index * 4, 2);
  const scalarIsZero = code.i32_eqz(
    Array.from({ length: 8 }, (_, index) => scalarWord(index))
      .reduce((left, right) => code.i32_or(left, right)),
  );
  const copyBaseWords = Array.from({ length: G1_AFFINE_BYTES / 4 }, (_, index) =>
    code.i32_store(
      outBasePointer(),
      index * 4,
      2,
      code.i32_load(basePointer(), index * 4, 2),
    ));
  const copyScalarWords = Array.from({ length: 8 }, (_, index) =>
    code.i32_store(
      outScalarPointer(),
      index * 4,
      2,
      code.i32_load(scalarPointer(), index * 4, 2),
    ));
  const nonzeroCode = [
    ...copyBaseWords.flat() as unknown[],
    ...copyScalarWords.flat() as unknown[],
    ...code.setLocal("count", code.i32_add(code.getLocal("count"), code.i32_const(1))) as unknown[],
  ];
  fn.addCode(
    code.setLocal("i", code.i32_const(0)),
    code.setLocal("count", code.i32_const(0)),
    code.block(
      code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("i"), code.getLocal("n"))),
        code.if(code.i32_eqz(scalarIsZero), nonzeroCode),
        code.setLocal("i", code.i32_add(code.getLocal("i"), code.i32_const(1))),
        code.br(0),
      ),
    ),
    code.i32_store(code.getLocal("pCount"), code.getLocal("count")),
  );
  module.exportFunction(SPARSE_COMPACT);
}

function buildCompactionTask(
  bases: Uint8Array,
  montgomeryScalars: Uint8Array,
  scalarBytes: number,
): FfWorkerCommand[] {
  const elementCount = bases.byteLength / G1_AFFINE_BYTES;
  return [
    { cmd: "ALLOCSET", var: 0, buff: bases },
    { cmd: "ALLOCSET", var: 1, buff: montgomeryScalars },
    { cmd: "ALLOC", var: 2, len: bases.byteLength },
    { cmd: "ALLOC", var: 3, len: elementCount * scalarBytes },
    { cmd: "ALLOC", var: 4, len: 4 },
    {
      cmd: "CALL",
      fnName: SPARSE_COMPACT,
      params: [{ var: 0 }, { var: 1 }, { val: elementCount }, { var: 2 }, { var: 3 }, { var: 4 }],
    },
    { cmd: "GET", out: 0, var: 2, len: bases.byteLength },
    { cmd: "GET", out: 1, var: 3, len: elementCount * scalarBytes },
    { cmd: "GET", out: 2, var: 4, len: 4 },
  ];
}

function decodeTaskResult(
  result: readonly Uint8Array[],
  maxCount: number,
  scalarBytes: number,
): CompactedInput {
  if (result.length !== 3 || result[2].byteLength !== 4) {
    throw new Error("Sparse compaction task returned an invalid output set.");
  }
  const count = new DataView(result[2].buffer, result[2].byteOffset, 4).getUint32(0, true);
  if (count > maxCount) {
    throw new Error("Sparse compaction task returned an invalid nonzero count.");
  }
  return {
    bases: result[0].slice(0, count * G1_AFFINE_BYTES),
    montgomeryScalars: result[1].slice(0, count * scalarBytes),
    nonzeroCount: count,
  };
}

function assertInputs(field: FfField, bases: Uint8Array, scalars: Uint8Array): void {
  if (bases.byteLength % G1_AFFINE_BYTES !== 0) {
    throw new Error("Sparse compaction bases must contain complete affine G1 points.");
  }
  if (scalars.byteLength !== (bases.byteLength / G1_AFFINE_BYTES) * field.n8) {
    throw new Error("Sparse compaction scalar count does not match the base count.");
  }
}

function splitRanges(
  elementCount: number,
  requestedTaskCount: number,
): readonly { start: number; count: number }[] {
  if (elementCount === 0) {
    return [];
  }
  const taskCount = Math.min(elementCount, requestedTaskCount);
  return Array.from({ length: taskCount }, (_, index) => {
    const start = Math.floor((elementCount * index) / taskCount);
    const end = Math.floor((elementCount * (index + 1)) / taskCount);
    return { start, count: end - start };
  });
}
