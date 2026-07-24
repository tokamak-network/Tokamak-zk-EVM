import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { getCurveFromName } from "ffjavascript";
import {
  FIELD_BATCH_ADD_SCALED,
  FIELD_BATCH_ADD_SCALED_PREFIX,
  FIELD_BATCH_SCALE_X,
  FIELD_BATCH_SCALE_Y,
  installLinearBatchPlugin,
  type WasmModuleBuilder,
} from "../../../src/core/field/linear-batch-plugin.js";

interface BenchmarkOptions {
  readonly shape: readonly [number, number];
  readonly prefixShape: readonly [number, number];
  readonly iterations: number;
  readonly warmup: number;
  readonly workerCounts: readonly number[];
  readonly operations: readonly string[];
  readonly jsonPath?: string;
}

interface Timing {
  readonly medianMs: number;
  readonly minMs: number;
  readonly maxMs: number;
}

interface BenchmarkRow extends Timing {
  readonly operation: string;
  readonly candidate: string;
  readonly workers: number;
  readonly outputBytes: number;
  readonly explicitTemporaryBytes: number;
  readonly parity: boolean;
}

interface BenchmarkResult {
  readonly generatedAt: string;
  readonly shape: readonly [number, number];
  readonly prefixShape: readonly [number, number];
  readonly elementCount: number;
  readonly elementBytes: number;
  readonly inputBytes: number;
  readonly runtimeConcurrency: number;
  readonly iterations: number;
  readonly warmup: number;
  readonly rows: readonly BenchmarkRow[];
}

interface ThreadTaskParameter {
  readonly var?: number;
  readonly val?: number;
}

type ThreadTask =
  | { readonly cmd: "ALLOCSET"; readonly var: number; readonly buff: Uint8Array }
  | { readonly cmd: "ALLOC"; readonly var: number; readonly len: number }
  | { readonly cmd: "CALL"; readonly fnName: string; readonly params: readonly ThreadTaskParameter[] }
  | { readonly cmd: "GET"; readonly out: number; readonly var: number; readonly len: number };

interface ThreadManagerLike {
  concurrency: number;
  queueAction(tasks: readonly ThreadTask[]): Promise<readonly Uint8Array[]>;
}

interface FieldLike {
  readonly n8: number;
  readonly p: bigint;
  readonly zero: Uint8Array;
  readonly one: Uint8Array;
  readonly tm: ThreadManagerLike;
  add(left: Uint8Array, right: Uint8Array): Uint8Array;
  sub(left: Uint8Array, right: Uint8Array): Uint8Array;
  mul(left: Uint8Array, right: Uint8Array): Uint8Array;
  neg(value: Uint8Array): Uint8Array;
  exp(value: Uint8Array, exponent: bigint | number): Uint8Array;
  fromObject(value: bigint): Uint8Array;
  batchApplyKey(input: Uint8Array, first: Uint8Array, increment: Uint8Array): Promise<Uint8Array>;
}

interface CurveLike {
  readonly Fr: FieldLike;
  terminate?(): Promise<void>;
}

interface BinaryBatchInput {
  readonly left: Uint8Array;
  readonly right: Uint8Array;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const getCurveWithPlugin = getCurveFromName as unknown as (
    name: string,
    singleThread: boolean,
    plugin: (module: WasmModuleBuilder) => void,
  ) => Promise<CurveLike>;
  const single = await getCurveWithPlugin("bls12381", true, installLinearBatchPlugin);
  const multi = await getCurveWithPlugin("bls12381", false, installLinearBatchPlugin);

  try {
    const field = multi.Fr;
    const [xSize, ySize] = options.shape;
    const [prefixXSize, prefixYSize] = options.prefixShape;
    if (prefixXSize > xSize || prefixYSize > ySize) {
      throw new Error("Prefix shape must fit inside the target shape.");
    }

    const target = createDeterministicFieldBuffer(field, xSize * ySize, 0x1234_5678n);
    const source = createDeterministicFieldBuffer(field, xSize * ySize, 0x9abc_def0n);
    const prefix = createDeterministicFieldBuffer(field, prefixXSize * prefixYSize, 0x0fed_cba9n);
    const factor = field.fromObject(0x1234_5678_9abcn % field.p);
    const xFactor = field.fromObject(0x3456_789a_bcden % field.p);
    const yFactor = field.fromObject(0x5678_9abc_def0n % field.p);

    const emptyReference = new Uint8Array();
    const references = {
      add: options.operations.includes("add") ? scalarBinaryLoop(field, target, source, "add") : emptyReference,
      sub: options.operations.includes("sub") ? scalarBinaryLoop(field, target, source, "sub") : emptyReference,
      scale: options.operations.includes("scale") ? scalarScaleLoop(field, source, factor) : emptyReference,
      addScaled: options.operations.includes("add-scaled")
        ? scalarAddScaledLoop(field, target, source, factor)
        : emptyReference,
      addScaledPrefix: options.operations.includes("add-scaled-prefix")
        ? scalarAddScaledPrefixLoop(
            field,
            target,
            xSize,
            ySize,
            prefix,
            prefixXSize,
            prefixYSize,
            factor,
          )
        : emptyReference,
      scaleX: options.operations.includes("scale-x")
        ? scalarScaleXLoop(field, source, xSize, ySize, xFactor)
        : emptyReference,
      scaleY: options.operations.includes("scale-y")
        ? scalarScaleYLoop(field, source, xSize, ySize, yFactor)
        : emptyReference,
    };

    const rows: BenchmarkRow[] = [];
    rows.push(
      await benchmarkRow(
        options,
        "add",
        "current-coefficient-loop",
        0,
        target.byteLength,
        target.byteLength,
        () => scalarBinaryLoop(field, target, source, "add"),
        references.add,
      ),
      await benchmarkRow(
        options,
        "sub",
        "current-coefficient-loop",
        0,
        target.byteLength,
        target.byteLength,
        () => scalarBinaryLoop(field, target, source, "sub"),
        references.sub,
      ),
      await benchmarkRow(
        options,
        "scale",
        "current-coefficient-loop",
        0,
        source.byteLength,
        source.byteLength,
        () => scalarScaleLoop(field, source, factor),
        references.scale,
      ),
      await benchmarkRow(
        options,
        "add-scaled",
        "current-coefficient-loop",
        0,
        target.byteLength,
        target.byteLength,
        () => scalarAddScaledLoop(field, target, source, factor),
        references.addScaled,
      ),
      await benchmarkRow(
        options,
        "add-scaled-prefix",
        "current-coefficient-loop",
        0,
        target.byteLength,
        target.byteLength,
        () =>
          scalarAddScaledPrefixLoop(
            field,
            target,
            xSize,
            ySize,
            prefix,
            prefixXSize,
            prefixYSize,
            factor,
          ),
        references.addScaledPrefix,
      ),
      await benchmarkRow(
        options,
        "scale-x",
        "current-coefficient-loop",
        0,
        source.byteLength,
        source.byteLength,
        () => scalarScaleXLoop(field, source, xSize, ySize, xFactor),
        references.scaleX,
      ),
      await benchmarkRow(
        options,
        "scale-y",
        "current-coefficient-loop",
        0,
        source.byteLength,
        source.byteLength,
        () => scalarScaleYLoop(field, source, xSize, ySize, yFactor),
        references.scaleY,
      ),
    );

    rows.push(
      await benchmarkRow(
        options,
        "add",
        "whole-chunk-wasm-caller-thread",
        1,
        target.byteLength,
        target.byteLength * 3,
        () => batchBinary(single.Fr, { left: target, right: source }, "frm_batchAdd", 1),
        references.add,
      ),
      await benchmarkRow(
        options,
        "sub",
        "whole-chunk-wasm-caller-thread",
        1,
        target.byteLength,
        target.byteLength * 3,
        () => batchBinary(single.Fr, { left: target, right: source }, "frm_batchSub", 1),
        references.sub,
      ),
      await benchmarkRow(
        options,
        "scale",
        "public-batch-key-caller-thread",
        1,
        source.byteLength,
        source.byteLength * 2,
        () => single.Fr.batchApplyKey(source, factor, single.Fr.one),
        references.scale,
      ),
      await benchmarkRow(
        options,
        "add-scaled",
        "fused-wasm-caller-thread",
        1,
        target.byteLength,
        target.byteLength * 3,
        () => batchAddScaled(single.Fr, target, source, factor, 1),
        references.addScaled,
      ),
      await benchmarkRow(
        options,
        "add-scaled",
        "two-pass-batch-caller-thread",
        1,
        target.byteLength,
        target.byteLength * 5,
        async () => {
          const scaled = await single.Fr.batchApplyKey(source, factor, single.Fr.one);
          return await batchBinary(single.Fr, { left: target, right: scaled }, "frm_batchAdd", 1);
        },
        references.addScaled,
      ),
      await benchmarkRow(
        options,
        "add-scaled-prefix",
        "strided-fused-wasm-caller-thread",
        1,
        target.byteLength,
        target.byteLength * 2 + prefix.byteLength,
        () =>
          batchAddScaledPrefix(
            single.Fr,
            target,
            xSize,
            ySize,
            prefix,
            prefixXSize,
            prefixYSize,
            factor,
            1,
          ),
        references.addScaledPrefix,
      ),
      await benchmarkRow(
        options,
        "scale-x",
        "layout-aware-wasm-caller-thread",
        1,
        source.byteLength,
        source.byteLength * 2,
        () => batchScaleX(single.Fr, source, xSize, ySize, xFactor, 1),
        references.scaleX,
      ),
      await benchmarkRow(
        options,
        "scale-y",
        "layout-aware-wasm-caller-thread",
        1,
        source.byteLength,
        source.byteLength * 2,
        () => batchScaleY(single.Fr, source, xSize, ySize, yFactor, 1),
        references.scaleY,
      ),
    );

    for (const requestedWorkers of options.workerCounts) {
      const workers = Math.min(requestedWorkers, field.tm.concurrency, xSize);
      rows.push(
        await benchmarkRow(
          options,
          "add",
          "whole-chunk-wasm-workers",
          workers,
          target.byteLength,
          target.byteLength * 3,
          () => batchBinary(field, { left: target, right: source }, "frm_batchAdd", workers),
          references.add,
        ),
        await benchmarkRow(
          options,
          "sub",
          "whole-chunk-wasm-workers",
          workers,
          target.byteLength,
          target.byteLength * 3,
          () => batchBinary(field, { left: target, right: source }, "frm_batchSub", workers),
          references.sub,
        ),
        await benchmarkRow(
          options,
          "scale",
          "public-batch-key-workers",
          workers,
          source.byteLength,
          source.byteLength * 2,
          () => batchApplyKeyWithWorkerCount(field, source, factor, field.one, workers),
          references.scale,
        ),
        await benchmarkRow(
          options,
          "add-scaled",
          "fused-wasm-workers",
          workers,
          target.byteLength,
          target.byteLength * 3,
          () => batchAddScaled(field, target, source, factor, workers),
          references.addScaled,
        ),
        await benchmarkRow(
          options,
          "add-scaled",
          "two-pass-batch-workers",
          workers,
          target.byteLength,
          target.byteLength * 5,
          async () => {
            const scaled = await batchApplyKeyWithWorkerCount(field, source, factor, field.one, workers);
            return await batchBinary(field, { left: target, right: scaled }, "frm_batchAdd", workers);
          },
          references.addScaled,
        ),
        await benchmarkRow(
          options,
          "add-scaled-prefix",
          "strided-fused-wasm-workers",
          workers,
          target.byteLength,
          target.byteLength * 2 + prefix.byteLength,
          () =>
            batchAddScaledPrefix(
              field,
              target,
              xSize,
              ySize,
              prefix,
              prefixXSize,
              prefixYSize,
              factor,
              workers,
            ),
          references.addScaledPrefix,
        ),
        await benchmarkRow(
          options,
          "scale-x",
          "layout-aware-wasm-workers",
          workers,
          source.byteLength,
          source.byteLength * 2,
          () => batchScaleX(field, source, xSize, ySize, xFactor, workers),
          references.scaleX,
        ),
        await benchmarkRow(
          options,
          "scale-y",
          "layout-aware-wasm-workers",
          workers,
          source.byteLength,
          source.byteLength * 2,
          () => batchScaleY(field, source, xSize, ySize, yFactor, workers),
          references.scaleY,
        ),
      );
    }

    const result: BenchmarkResult = {
      generatedAt: new Date().toISOString(),
      shape: options.shape,
      prefixShape: options.prefixShape,
      elementCount: xSize * ySize,
      elementBytes: field.n8,
      inputBytes: target.byteLength,
      runtimeConcurrency: field.tm.concurrency,
      iterations: options.iterations,
      warmup: options.warmup,
      rows: rows.filter((row) => Number.isFinite(row.medianMs)),
    };

    console.log(JSON.stringify(result, null, 2));
    if (options.jsonPath !== undefined) {
      const outputPath = resolve(options.jsonPath);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    }
  } finally {
    await single.terminate?.();
    await multi.terminate?.();
  }
}

async function benchmarkRow(
  options: BenchmarkOptions,
  operation: string,
  candidate: string,
  workers: number,
  outputBytes: number,
  explicitTemporaryBytes: number,
  operationFn: () => Uint8Array | Promise<Uint8Array>,
  expected: Uint8Array,
): Promise<BenchmarkRow> {
  if (!options.operations.includes(operation)) {
    return {
      operation,
      candidate,
      workers,
      outputBytes,
      explicitTemporaryBytes,
      parity: true,
      medianMs: Number.NaN,
      minMs: Number.NaN,
      maxMs: Number.NaN,
    };
  }
  for (let index = 0; index < options.warmup; index += 1) {
    const warmupOutput = await operationFn();
    assertEqualBytes(warmupOutput, expected, `${operation}/${candidate} warmup`);
  }

  const timings: number[] = [];
  let output: Uint8Array = new Uint8Array();
  for (let index = 0; index < options.iterations; index += 1) {
    const startedAt = performance.now();
    output = await operationFn();
    timings.push(performance.now() - startedAt);
  }
  assertEqualBytes(output, expected, `${operation}/${candidate}`);
  timings.sort((left, right) => left - right);
  return {
    operation,
    candidate,
    workers,
    outputBytes,
    explicitTemporaryBytes,
    parity: true,
    medianMs: timings[Math.floor(timings.length / 2)],
    minMs: timings[0],
    maxMs: timings[timings.length - 1],
  };
}

async function batchBinary(
  field: FieldLike,
  input: BinaryBatchInput,
  functionName: "frm_batchAdd" | "frm_batchSub",
  taskCount: number,
): Promise<Uint8Array> {
  assertSameBufferLength(input.left, input.right, "Binary batch inputs");
  const elementCount = input.left.byteLength / field.n8;
  const ranges = splitElementRanges(elementCount, taskCount);
  const promises = ranges.map(({ start, count }) => {
    const byteStart = start * field.n8;
    const byteLength = count * field.n8;
    return field.tm.queueAction([
      { cmd: "ALLOCSET", var: 0, buff: input.left.slice(byteStart, byteStart + byteLength) },
      { cmd: "ALLOCSET", var: 1, buff: input.right.slice(byteStart, byteStart + byteLength) },
      { cmd: "ALLOC", var: 2, len: byteLength },
      {
        cmd: "CALL",
        fnName: functionName,
        params: [{ var: 0 }, { var: 1 }, { val: count }, { var: 2 }],
      },
      { cmd: "GET", out: 0, var: 2, len: byteLength },
    ]);
  });
  return assembleTaskOutputs(await Promise.all(promises), input.left.byteLength);
}

async function batchAddScaled(
  field: FieldLike,
  target: Uint8Array,
  source: Uint8Array,
  factor: Uint8Array,
  taskCount: number,
): Promise<Uint8Array> {
  assertSameBufferLength(target, source, "Add-scaled inputs");
  const elementCount = target.byteLength / field.n8;
  const ranges = splitElementRanges(elementCount, taskCount);
  const promises = ranges.map(({ start, count }) => {
    const byteStart = start * field.n8;
    const byteLength = count * field.n8;
    return field.tm.queueAction([
      { cmd: "ALLOCSET", var: 0, buff: target.slice(byteStart, byteStart + byteLength) },
      { cmd: "ALLOCSET", var: 1, buff: source.slice(byteStart, byteStart + byteLength) },
      { cmd: "ALLOCSET", var: 2, buff: factor },
      { cmd: "ALLOC", var: 3, len: byteLength },
      {
        cmd: "CALL",
        fnName: FIELD_BATCH_ADD_SCALED,
        params: [{ var: 0 }, { var: 1 }, { var: 2 }, { val: count }, { var: 3 }],
      },
      { cmd: "GET", out: 0, var: 3, len: byteLength },
    ]);
  });
  return assembleTaskOutputs(await Promise.all(promises), target.byteLength);
}

async function batchAddScaledPrefix(
  field: FieldLike,
  target: Uint8Array,
  targetXSize: number,
  targetYSize: number,
  source: Uint8Array,
  sourceXSize: number,
  sourceYSize: number,
  factor: Uint8Array,
  taskCount: number,
): Promise<Uint8Array> {
  const ranges = splitElementRanges(sourceXSize, taskCount);
  const output = target.slice();
  const promises = ranges.map(({ start, count }) => {
    const targetByteStart = start * targetYSize * field.n8;
    const targetByteLength = count * targetYSize * field.n8;
    const sourceByteStart = start * sourceYSize * field.n8;
    const sourceByteLength = count * sourceYSize * field.n8;
    return field.tm.queueAction([
      { cmd: "ALLOCSET", var: 0, buff: target.slice(targetByteStart, targetByteStart + targetByteLength) },
      { cmd: "ALLOCSET", var: 1, buff: source.slice(sourceByteStart, sourceByteStart + sourceByteLength) },
      { cmd: "ALLOCSET", var: 2, buff: factor },
      {
        cmd: "CALL",
        fnName: FIELD_BATCH_ADD_SCALED_PREFIX,
        params: [
          { var: 0 },
          { var: 1 },
          { var: 2 },
          { val: count },
          { val: targetYSize },
          { val: sourceYSize },
        ],
      },
      { cmd: "GET", out: 0, var: 0, len: targetByteLength },
    ]);
  });
  const results = await Promise.all(promises);
  for (let index = 0; index < ranges.length; index += 1) {
    output.set(results[index][0], ranges[index].start * targetYSize * field.n8);
  }
  if (targetXSize * targetYSize * field.n8 !== target.byteLength) {
    throw new Error("Target shape does not match target buffer length.");
  }
  return output;
}

async function batchScaleX(
  field: FieldLike,
  input: Uint8Array,
  xSize: number,
  ySize: number,
  factor: Uint8Array,
  taskCount: number,
): Promise<Uint8Array> {
  const ranges = splitElementRanges(xSize, taskCount);
  const promises = ranges.map(({ start, count }) => {
    const byteStart = start * ySize * field.n8;
    const byteLength = count * ySize * field.n8;
    const startPower = field.exp(factor, start);
    return field.tm.queueAction([
      { cmd: "ALLOCSET", var: 0, buff: input.slice(byteStart, byteStart + byteLength) },
      { cmd: "ALLOCSET", var: 1, buff: factor },
      { cmd: "ALLOCSET", var: 2, buff: startPower },
      { cmd: "ALLOC", var: 3, len: byteLength },
      {
        cmd: "CALL",
        fnName: FIELD_BATCH_SCALE_X,
        params: [{ var: 0 }, { var: 1 }, { var: 2 }, { val: count }, { val: ySize }, { var: 3 }],
      },
      { cmd: "GET", out: 0, var: 3, len: byteLength },
    ]);
  });
  return assembleTaskOutputs(await Promise.all(promises), input.byteLength);
}

async function batchScaleY(
  field: FieldLike,
  input: Uint8Array,
  xSize: number,
  ySize: number,
  factor: Uint8Array,
  taskCount: number,
): Promise<Uint8Array> {
  const ranges = splitElementRanges(xSize, taskCount);
  const promises = ranges.map(({ start, count }) => {
    const byteStart = start * ySize * field.n8;
    const byteLength = count * ySize * field.n8;
    return field.tm.queueAction([
      { cmd: "ALLOCSET", var: 0, buff: input.slice(byteStart, byteStart + byteLength) },
      { cmd: "ALLOCSET", var: 1, buff: factor },
      { cmd: "ALLOCSET", var: 2, buff: field.one },
      { cmd: "ALLOCSET", var: 3, buff: field.one },
      { cmd: "ALLOC", var: 4, len: byteLength },
      {
        cmd: "CALL",
        fnName: FIELD_BATCH_SCALE_Y,
        params: [
          { var: 0 },
          { var: 1 },
          { var: 2 },
          { var: 3 },
          { val: count },
          { val: ySize },
          { var: 4 },
        ],
      },
      { cmd: "GET", out: 0, var: 4, len: byteLength },
    ]);
  });
  return assembleTaskOutputs(await Promise.all(promises), input.byteLength);
}

async function batchApplyKeyWithWorkerCount(
  field: FieldLike,
  input: Uint8Array,
  first: Uint8Array,
  increment: Uint8Array,
  workerCount: number,
): Promise<Uint8Array> {
  const originalConcurrency = field.tm.concurrency;
  field.tm.concurrency = workerCount;
  try {
    return await field.batchApplyKey(input, first, increment);
  } finally {
    field.tm.concurrency = originalConcurrency;
  }
}

function scalarBinaryLoop(
  field: FieldLike,
  left: Uint8Array,
  right: Uint8Array,
  operation: "add" | "sub",
): Uint8Array {
  assertSameBufferLength(left, right, "Scalar binary inputs");
  const output = new Uint8Array(left.byteLength);
  for (let offset = 0; offset < output.byteLength; offset += field.n8) {
    output.set(
      field[operation](left.subarray(offset, offset + field.n8), right.subarray(offset, offset + field.n8)),
      offset,
    );
  }
  return output;
}

function scalarScaleLoop(field: FieldLike, input: Uint8Array, factor: Uint8Array): Uint8Array {
  const output = new Uint8Array(input.byteLength);
  for (let offset = 0; offset < output.byteLength; offset += field.n8) {
    output.set(field.mul(input.subarray(offset, offset + field.n8), factor), offset);
  }
  return output;
}

function scalarAddScaledLoop(
  field: FieldLike,
  target: Uint8Array,
  source: Uint8Array,
  factor: Uint8Array,
): Uint8Array {
  assertSameBufferLength(target, source, "Scalar add-scaled inputs");
  const output = new Uint8Array(target.byteLength);
  for (let offset = 0; offset < output.byteLength; offset += field.n8) {
    output.set(
      field.add(
        target.subarray(offset, offset + field.n8),
        field.mul(source.subarray(offset, offset + field.n8), factor),
      ),
      offset,
    );
  }
  return output;
}

function scalarAddScaledPrefixLoop(
  field: FieldLike,
  target: Uint8Array,
  targetXSize: number,
  targetYSize: number,
  source: Uint8Array,
  sourceXSize: number,
  sourceYSize: number,
  factor: Uint8Array,
): Uint8Array {
  const output = target.slice();
  for (let x = 0; x < sourceXSize; x += 1) {
    const targetRowOffset = x * targetYSize * field.n8;
    const sourceRowOffset = x * sourceYSize * field.n8;
    for (let y = 0; y < sourceYSize; y += 1) {
      const targetOffset = targetRowOffset + y * field.n8;
      const sourceOffset = sourceRowOffset + y * field.n8;
      output.set(
        field.add(
          output.subarray(targetOffset, targetOffset + field.n8),
          field.mul(source.subarray(sourceOffset, sourceOffset + field.n8), factor),
        ),
        targetOffset,
      );
    }
  }
  if (targetXSize * targetYSize * field.n8 !== target.byteLength) {
    throw new Error("Target shape does not match target buffer length.");
  }
  return output;
}

function scalarScaleXLoop(
  field: FieldLike,
  input: Uint8Array,
  xSize: number,
  ySize: number,
  factor: Uint8Array,
): Uint8Array {
  const output = new Uint8Array(input.byteLength);
  let power = field.one;
  for (let x = 0; x < xSize; x += 1) {
    for (let y = 0; y < ySize; y += 1) {
      const offset = (x * ySize + y) * field.n8;
      output.set(field.mul(input.subarray(offset, offset + field.n8), power), offset);
    }
    power = field.mul(power, factor);
  }
  return output;
}

function scalarScaleYLoop(
  field: FieldLike,
  input: Uint8Array,
  xSize: number,
  ySize: number,
  factor: Uint8Array,
): Uint8Array {
  const output = new Uint8Array(input.byteLength);
  for (let x = 0; x < xSize; x += 1) {
    let power = field.one;
    for (let y = 0; y < ySize; y += 1) {
      const offset = (x * ySize + y) * field.n8;
      output.set(field.mul(input.subarray(offset, offset + field.n8), power), offset);
      power = field.mul(power, factor);
    }
  }
  return output;
}

function createDeterministicFieldBuffer(field: FieldLike, elementCount: number, seed: bigint): Uint8Array {
  const poolSize = Math.min(1024, Math.max(1, elementCount));
  const pool: Uint8Array[] = [];
  let state = seed;
  for (let index = 0; index < poolSize; index += 1) {
    state = xorshift64(state);
    pool.push(field.fromObject(state % field.p));
  }
  const output = new Uint8Array(elementCount * field.n8);
  let selection = seed ^ 0x9e37_79b9_7f4a_7c15n;
  for (let index = 0; index < elementCount; index += 1) {
    selection = xorshift64(selection);
    output.set(pool[Number(selection % BigInt(poolSize))], index * field.n8);
  }
  return output;
}

function xorshift64(value: bigint): bigint {
  const mask = (1n << 64n) - 1n;
  let next = value & mask;
  next ^= (next << 13n) & mask;
  next ^= next >> 7n;
  next ^= (next << 17n) & mask;
  return next & mask;
}

function splitElementRanges(elementCount: number, taskCount: number): readonly { start: number; count: number }[] {
  if (!Number.isSafeInteger(taskCount) || taskCount <= 0) {
    throw new Error("Task count must be a positive safe integer.");
  }
  const actualTaskCount = Math.min(taskCount, elementCount);
  const ranges: { start: number; count: number }[] = [];
  for (let index = 0; index < actualTaskCount; index += 1) {
    const start = Math.floor((elementCount * index) / actualTaskCount);
    const end = Math.floor((elementCount * (index + 1)) / actualTaskCount);
    ranges.push({ start, count: end - start });
  }
  return ranges;
}

function assembleTaskOutputs(results: readonly (readonly Uint8Array[])[], outputByteLength: number): Uint8Array {
  const output = new Uint8Array(outputByteLength);
  let offset = 0;
  for (const result of results) {
    const chunk = result[0];
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (offset !== outputByteLength) {
    throw new Error(`Task output byte length mismatch: expected ${outputByteLength}, received ${offset}.`);
  }
  return output;
}

function assertEqualBytes(actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (actual.byteLength !== expected.byteLength) {
    throw new Error(`${label} byte length mismatch.`);
  }
  for (let index = 0; index < actual.byteLength; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(`${label} byte mismatch at offset ${index}.`);
    }
  }
}

function assertSameBufferLength(left: Uint8Array, right: Uint8Array, label: string): void {
  if (left.byteLength !== right.byteLength) {
    throw new Error(`${label} must have equal byte lengths.`);
  }
}

function parseOptions(args: readonly string[]): BenchmarkOptions {
  let shape: readonly [number, number] = [4096, 256];
  let prefixShape: readonly [number, number] | undefined;
  let iterations = 3;
  let warmup = 1;
  let workerCounts: readonly number[] = [1, 2, 4, 8, 64];
  let operations: readonly string[] = [
    "add",
    "sub",
    "scale",
    "add-scaled",
    "add-scaled-prefix",
    "scale-x",
    "scale-y",
  ];
  let jsonPath: string | undefined;

  for (const arg of args) {
    if (arg.startsWith("--shape=")) {
      shape = parseShape(arg.slice("--shape=".length), "shape");
    } else if (arg.startsWith("--prefix-shape=")) {
      prefixShape = parseShape(arg.slice("--prefix-shape=".length), "prefix shape");
    } else if (arg.startsWith("--iterations=")) {
      iterations = parsePositiveInteger(arg.slice("--iterations=".length), "iterations");
    } else if (arg.startsWith("--warmup=")) {
      warmup = parseNonNegativeInteger(arg.slice("--warmup=".length), "warmup");
    } else if (arg.startsWith("--workers=")) {
      workerCounts = arg
        .slice("--workers=".length)
        .split(",")
        .map((value) => parsePositiveInteger(value, "worker count"));
    } else if (arg.startsWith("--operations=")) {
      operations = arg.slice("--operations=".length).split(",");
      const knownOperations = new Set([
        "add",
        "sub",
        "scale",
        "add-scaled",
        "add-scaled-prefix",
        "scale-x",
        "scale-y",
      ]);
      for (const operation of operations) {
        if (!knownOperations.has(operation)) {
          throw new Error(`Unknown operation: ${operation}`);
        }
      }
    } else if (arg.startsWith("--json=")) {
      jsonPath = arg.slice("--json=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return {
    shape,
    prefixShape: prefixShape ?? [shape[0], Math.max(1, Math.floor(shape[1] / 2))],
    iterations,
    warmup,
    workerCounts,
    operations,
    jsonPath,
  };
}

function parseShape(value: string, label: string): readonly [number, number] {
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (match === null) {
    throw new Error(`${label} must use XxY syntax.`);
  }
  return [parsePositiveInteger(match[1], `${label} X`), parsePositiveInteger(match[2], `${label} Y`)];
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return parsed;
}

function parseNonNegativeInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return parsed;
}

await main();
