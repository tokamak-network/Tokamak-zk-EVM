import { getCurveFromName } from "ffjavascript";

import { BivariatePolynomialBuffer } from "../../../src/index.js";
import type { FfField, FfWorkerCommand } from "../../../src/core/curve/curve.js";
import { createFieldRuntime, type FieldRuntime } from "../../../src/core/field/field.js";
import {
  installLinearBatchPlugin,
  type WasmModuleBuilder,
} from "../../../src/core/field/linear-batch-plugin.js";

const K0_RECURRENCE = "tokamak_bench_k0Recurrence";
const KL_RECURRENCE_X = "tokamak_bench_klRecurrenceX";
const KL_RECURRENCE_Y = "tokamak_bench_klRecurrenceY";

interface RawCurve {
  readonly Fr: FfField;
  terminate?(): Promise<void>;
}

interface WasmCodeBuilder {
  i32_const(value: number): unknown;
  getLocal(name: string): unknown;
  setLocal(name: string, value: unknown): unknown;
  i32_add(left: unknown, right: unknown): unknown;
  i32_sub(left: unknown, right: unknown): unknown;
  i32_mul(left: unknown, right: unknown): unknown;
  i32_eq(left: unknown, right: unknown): unknown;
  i32_ge_u(left: unknown, right: unknown): unknown;
  i32_gt_u(left: unknown, right: unknown): unknown;
  i32_lt_u(left: unknown, right: unknown): unknown;
  call(name: string, ...params: unknown[]): unknown;
  br(depth: number): unknown;
  br_if(depth: number, condition: unknown): unknown;
  block(code: unknown): unknown;
  loop(...code: unknown[]): unknown;
  if(condition: unknown, thenCode: unknown): unknown;
}

interface FunctionBuilder {
  addParam(name: string, type: "i32"): void;
  addLocal(name: string, type: "i32"): void;
  getCodeBuilder(): WasmCodeBuilder;
  addCode(...code: unknown[]): void;
}

interface ModuleBuilder {
  alloc(size: number): number;
  addFunction(name: string): FunctionBuilder;
  exportFunction(name: string): void;
}

export interface StructuredBenchmarkRuntimes {
  readonly field: FieldRuntime;
  readonly singleField: FfField;
  readonly multiField: FfField;
  readonly workerCount: number;
  terminate(): Promise<void>;
}

export async function createStructuredBenchmarkRuntimes(): Promise<StructuredBenchmarkRuntimes> {
  const loadCurve = getCurveFromName as unknown as (
    name: string,
    singleThread: boolean,
    plugin: (module: WasmModuleBuilder) => void,
  ) => Promise<RawCurve>;
  const single = await loadCurve("bls12381", true, installStructuredBenchmarkPlugin);
  const multi = await loadCurve("bls12381", false, installStructuredBenchmarkPlugin);
  return {
    field: createFieldRuntime(multi.Fr),
    singleField: single.Fr,
    multiField: multi.Fr,
    workerCount: multi.Fr.tm.concurrency,
    async terminate() {
      await Promise.all([single.terminate?.(), multi.terminate?.()]);
    },
  };
}

export async function multiplyK0WasmSingle(
  runtime: StructuredBenchmarkRuntimes,
  polynomial: BivariatePolynomialBuffer,
  mI: number,
): Promise<BivariatePolynomialBuffer> {
  return multiplyK0(runtime, runtime.singleField, polynomial, mI, 1);
}

export async function multiplyK0WasmOneWorker(
  runtime: StructuredBenchmarkRuntimes,
  polynomial: BivariatePolynomialBuffer,
  mI: number,
): Promise<BivariatePolynomialBuffer> {
  return multiplyK0(runtime, runtime.multiField, polynomial, mI, 1);
}

export async function multiplyK0WasmWorkers(
  runtime: StructuredBenchmarkRuntimes,
  polynomial: BivariatePolynomialBuffer,
  mI: number,
): Promise<BivariatePolynomialBuffer> {
  return multiplyK0(runtime, runtime.multiField, polynomial, mI, runtime.workerCount);
}

export function k0TemporaryBytes(
  inputXSize: number,
  inputYSize: number,
  outputXSize: number,
  elementBytes: number,
  taskCount: number,
): number {
  const inputBytes = inputXSize * inputYSize * elementBytes;
  const outputBytes = outputXSize * inputYSize * elementBytes;
  const packedInput = taskCount === 1 ? 0 : inputBytes;
  const packedOutput = taskCount === 1 ? outputBytes : outputBytes * 2;
  const windows = inputYSize * elementBytes;
  return packedInput + packedOutput + windows;
}

export async function multiplyKlWasmSingle(
  runtime: StructuredBenchmarkRuntimes,
  polynomial: BivariatePolynomialBuffer,
  mI: number,
  sMax: number,
): Promise<BivariatePolynomialBuffer> {
  return multiplyKl(runtime, runtime.singleField, polynomial, mI, sMax, 1);
}

export async function multiplyKlWasmOneWorker(
  runtime: StructuredBenchmarkRuntimes,
  polynomial: BivariatePolynomialBuffer,
  mI: number,
  sMax: number,
): Promise<BivariatePolynomialBuffer> {
  return multiplyKl(runtime, runtime.multiField, polynomial, mI, sMax, 1);
}

export async function multiplyKlWasmWorkers(
  runtime: StructuredBenchmarkRuntimes,
  polynomial: BivariatePolynomialBuffer,
  mI: number,
  sMax: number,
): Promise<BivariatePolynomialBuffer> {
  return multiplyKl(runtime, runtime.multiField, polynomial, mI, sMax, runtime.workerCount);
}

export function klTemporaryBytes(
  inputXSize: number,
  inputYSize: number,
  outputXSize: number,
  outputYSize: number,
  elementBytes: number,
  taskCount: number,
): number {
  const inputBytes = inputXSize * inputYSize * elementBytes;
  const intermediateBytes = outputXSize * inputYSize * elementBytes;
  const outputBytes = outputXSize * outputYSize * elementBytes;
  const shardCopies = taskCount === 1
    ? intermediateBytes + outputBytes
    : inputBytes + intermediateBytes * 2 + outputBytes;
  return intermediateBytes + outputBytes + shardCopies;
}

async function multiplyK0(
  runtime: StructuredBenchmarkRuntimes,
  rawField: FfField,
  polynomial: BivariatePolynomialBuffer,
  mI: number,
  taskCount: number,
): Promise<BivariatePolynomialBuffer> {
  const degree = polynomial.findDegree();
  if (degree.xDegree < 0 || degree.yDegree < 0) {
    return BivariatePolynomialBuffer.zero(runtime.field);
  }
  const outputXSize = nextPowerOfTwo(degree.xDegree + mI);
  const outputYSize = nextPowerOfTwo(degree.yDegree + 1);
  const ranges = splitRanges(outputYSize, taskCount);
  const tasks = ranges.map(({ start, count }) => {
    const input = ranges.length === 1
      ? polynomial.coefficients
      : extractColumns(
          polynomial.coefficients,
          polynomial.xSize,
          polynomial.ySize,
          start,
          count,
          runtime.field.byteLength,
        );
    return rawField.tm.queueAction(buildK0Task(
      input,
      polynomial.xSize,
      count,
      outputXSize,
      mI,
      runtime.field.byteLength,
    ));
  });
  const taskResults = await Promise.all(tasks);
  const unscaled = ranges.length === 1
    ? requireOutputs(taskResults[0], 1, "K0 recurrence")[0]
    : assembleColumns(
        taskResults.map((result) => requireOutputs(result, 1, "K0 recurrence")[0]),
        ranges,
        outputXSize,
        outputYSize,
        runtime.field.byteLength,
      );
  const inverseMI = runtime.field.inv(runtime.field.fromBigInt(BigInt(mI)));
  const output = await rawField.batchApplyKey(unscaled, inverseMI, runtime.field.one);
  return BivariatePolynomialBuffer.fromOwnedBuffer(
    runtime.field,
    output,
    outputXSize,
    outputYSize,
  );
}

async function multiplyKl(
  runtime: StructuredBenchmarkRuntimes,
  rawField: FfField,
  polynomial: BivariatePolynomialBuffer,
  mI: number,
  sMax: number,
  taskCount: number,
): Promise<BivariatePolynomialBuffer> {
  const degree = polynomial.findDegree();
  if (degree.xDegree < 0 || degree.yDegree < 0) {
    return BivariatePolynomialBuffer.zero(runtime.field);
  }
  const outputXSize = nextPowerOfTwo(degree.xDegree + mI);
  const outputYSize = nextPowerOfTwo(degree.yDegree + sMax);
  const xRanges = splitRanges(polynomial.ySize, taskCount);
  const rootX = runtime.field.rootOfUnity(mI);
  const xResults = await Promise.all(xRanges.map(({ start, count }) => {
    const input = xRanges.length === 1
      ? polynomial.coefficients
      : extractColumns(
          polynomial.coefficients,
          polynomial.xSize,
          polynomial.ySize,
          start,
          count,
          runtime.field.byteLength,
        );
    return rawField.tm.queueAction(buildKlXTask(
      input,
      polynomial.xSize,
      count,
      outputXSize,
      mI,
      rootX,
      runtime.field.byteLength,
    ));
  }));
  const intermediate = xRanges.length === 1
    ? requireOutputs(xResults[0], 1, "KL X recurrence")[0]
    : assembleColumns(
        xResults.map((result) => requireOutputs(result, 1, "KL X recurrence")[0]),
        xRanges,
        outputXSize,
        polynomial.ySize,
        runtime.field.byteLength,
      );

  const yRanges = splitRanges(outputXSize, taskCount);
  const rootY = runtime.field.rootOfUnity(sMax);
  const inputRowBytes = polynomial.ySize * runtime.field.byteLength;
  const yResults = await Promise.all(yRanges.map(({ start, count }) =>
    rawField.tm.queueAction(buildKlYTask(
      intermediate.slice(start * inputRowBytes, (start + count) * inputRowBytes),
      count,
      polynomial.ySize,
      outputYSize,
      sMax,
      rootY,
      runtime.field.byteLength,
    ))));
  const unscaled = concatSingleOutputs(
    yResults,
    outputXSize * outputYSize * runtime.field.byteLength,
  );
  const inverseDomain = runtime.field.inv(runtime.field.fromBigInt(BigInt(mI * sMax)));
  const output = await rawField.batchApplyKey(unscaled, inverseDomain, runtime.field.one);
  return BivariatePolynomialBuffer.fromOwnedBuffer(
    runtime.field,
    output,
    outputXSize,
    outputYSize,
  );
}

function installStructuredBenchmarkPlugin(module: WasmModuleBuilder): void {
  installLinearBatchPlugin(module);
  buildK0Kernel(module as unknown as ModuleBuilder);
  buildKlXKernel(module as unknown as ModuleBuilder);
  buildKlYKernel(module as unknown as ModuleBuilder);
}

function buildK0Kernel(module: ModuleBuilder): void {
  const fn = module.addFunction(K0_RECURRENCE);
  fn.addParam("pInput", "i32");
  fn.addParam("inputX", "i32");
  fn.addParam("localY", "i32");
  fn.addParam("outputX", "i32");
  fn.addParam("mI", "i32");
  fn.addParam("pWindow", "i32");
  fn.addParam("pOutput", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  const code = fn.getCodeBuilder();
  const current = code.i32_const(module.alloc(32));
  fn.addCode(
    code.setLocal("y", code.i32_const(0)),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("localY"))),
      code.call("frm_zero", rowPointer(code, "pWindow", code.i32_const(0), "localY")),
      code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
      code.br(0),
    )),
    code.setLocal("x", code.i32_const(0)),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("outputX"))),
      code.setLocal("y", code.i32_const(0)),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("localY"))),
        code.call(
          "frm_copy",
          rowPointer(code, "pWindow", code.i32_const(0), "localY"),
          current,
        ),
        code.if(
          code.i32_lt_u(code.getLocal("x"), code.getLocal("inputX")),
          code.call(
            "frm_add",
            current,
            rowPointer(code, "pInput", code.getLocal("x"), "localY"),
            current,
          ),
        ),
        code.if(
          code.i32_ge_u(code.getLocal("x"), code.getLocal("mI")),
          code.if(
            code.i32_lt_u(
              code.i32_sub(code.getLocal("x"), code.getLocal("mI")),
              code.getLocal("inputX"),
            ),
            code.call(
              "frm_sub",
              current,
              rowPointer(
                code,
                "pInput",
                code.i32_sub(code.getLocal("x"), code.getLocal("mI")),
                "localY",
              ),
              current,
            ),
          ),
        ),
        code.call(
          "frm_copy",
          current,
          rowPointer(code, "pWindow", code.i32_const(0), "localY"),
        ),
        code.call(
          "frm_copy",
          current,
          rowPointer(code, "pOutput", code.getLocal("x"), "localY"),
        ),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
      code.br(0),
    )),
  );
  module.exportFunction(K0_RECURRENCE);
}

function buildKlXKernel(module: ModuleBuilder): void {
  const fn = module.addFunction(KL_RECURRENCE_X);
  fn.addParam("pInput", "i32");
  fn.addParam("inputX", "i32");
  fn.addParam("localY", "i32");
  fn.addParam("outputX", "i32");
  fn.addParam("mI", "i32");
  fn.addParam("pRoot", "i32");
  fn.addParam("pOutput", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  const code = fn.getCodeBuilder();
  const value = code.i32_const(module.alloc(32));
  fn.addCode(
    code.setLocal("x", code.i32_const(0)),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("outputX"))),
      code.setLocal("y", code.i32_const(0)),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("localY"))),
        code.if(
          code.i32_gt_u(code.getLocal("x"), code.i32_const(0)),
          code.call(
            "frm_mul",
            rowPointer(
              code,
              "pOutput",
              code.i32_sub(code.getLocal("x"), code.i32_const(1)),
              "localY",
            ),
            code.getLocal("pRoot"),
            value,
          ),
        ),
        code.if(
          code.i32_eq(code.getLocal("x"), code.i32_const(0)),
          code.call("frm_zero", value),
        ),
        code.if(
          code.i32_lt_u(code.getLocal("x"), code.getLocal("inputX")),
          code.call(
            "frm_add",
            value,
            rowPointer(code, "pInput", code.getLocal("x"), "localY"),
            value,
          ),
        ),
        code.if(
          code.i32_ge_u(code.getLocal("x"), code.getLocal("mI")),
          code.if(
            code.i32_lt_u(
              code.i32_sub(code.getLocal("x"), code.getLocal("mI")),
              code.getLocal("inputX"),
            ),
            code.call(
              "frm_sub",
              value,
              rowPointer(
                code,
                "pInput",
                code.i32_sub(code.getLocal("x"), code.getLocal("mI")),
                "localY",
              ),
              value,
            ),
          ),
        ),
        code.call(
          "frm_copy",
          value,
          rowPointer(code, "pOutput", code.getLocal("x"), "localY"),
        ),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
      code.br(0),
    )),
  );
  module.exportFunction(KL_RECURRENCE_X);
}

function buildKlYKernel(module: ModuleBuilder): void {
  const fn = module.addFunction(KL_RECURRENCE_Y);
  fn.addParam("pInput", "i32");
  fn.addParam("xRows", "i32");
  fn.addParam("inputY", "i32");
  fn.addParam("outputY", "i32");
  fn.addParam("sMax", "i32");
  fn.addParam("pRoot", "i32");
  fn.addParam("pOutput", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  const code = fn.getCodeBuilder();
  const value = code.i32_const(module.alloc(32));
  fn.addCode(
    code.setLocal("x", code.i32_const(0)),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("xRows"))),
      code.setLocal("y", code.i32_const(0)),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("outputY"))),
        code.if(
          code.i32_gt_u(code.getLocal("y"), code.i32_const(0)),
          code.call(
            "frm_mul",
            klYPointer(
              code,
              "pOutput",
              "outputY",
              code.i32_sub(code.getLocal("y"), code.i32_const(1)),
            ),
            code.getLocal("pRoot"),
            value,
          ),
        ),
        code.if(
          code.i32_eq(code.getLocal("y"), code.i32_const(0)),
          code.call("frm_zero", value),
        ),
        code.if(
          code.i32_lt_u(code.getLocal("y"), code.getLocal("inputY")),
          code.call(
            "frm_add",
            value,
            klYPointer(code, "pInput", "inputY", code.getLocal("y")),
            value,
          ),
        ),
        code.if(
          code.i32_ge_u(code.getLocal("y"), code.getLocal("sMax")),
          code.if(
            code.i32_lt_u(
              code.i32_sub(code.getLocal("y"), code.getLocal("sMax")),
              code.getLocal("inputY"),
            ),
            code.call(
              "frm_sub",
              value,
              klYPointer(
                code,
                "pInput",
                "inputY",
                code.i32_sub(code.getLocal("y"), code.getLocal("sMax")),
              ),
              value,
            ),
          ),
        ),
        code.call(
          "frm_copy",
          value,
          klYPointer(code, "pOutput", "outputY", code.getLocal("y")),
        ),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
      code.br(0),
    )),
  );
  module.exportFunction(KL_RECURRENCE_Y);
}

function rowPointer(
  code: WasmCodeBuilder,
  base: string,
  row: unknown,
  rowSize: string,
): unknown {
  return code.i32_add(
    code.getLocal(base),
    code.i32_mul(
      code.i32_add(code.i32_mul(row, code.getLocal(rowSize)), code.getLocal("y")),
      code.i32_const(32),
    ),
  );
}

function klYPointer(
  code: WasmCodeBuilder,
  base: string,
  rowSize: string,
  column: unknown,
): unknown {
  return code.i32_add(
    code.getLocal(base),
    code.i32_mul(
      code.i32_add(
        code.i32_mul(code.getLocal("x"), code.getLocal(rowSize)),
        column,
      ),
      code.i32_const(32),
    ),
  );
}

function buildK0Task(
  input: Uint8Array,
  inputXSize: number,
  localYSize: number,
  outputXSize: number,
  mI: number,
  elementBytes: number,
): FfWorkerCommand[] {
  const outputBytes = outputXSize * localYSize * elementBytes;
  return [
    { cmd: "ALLOCSET", var: 0, buff: input },
    { cmd: "ALLOC", var: 1, len: localYSize * elementBytes },
    { cmd: "ALLOC", var: 2, len: outputBytes },
    {
      cmd: "CALL",
      fnName: K0_RECURRENCE,
      params: [
        { var: 0 },
        { val: inputXSize },
        { val: localYSize },
        { val: outputXSize },
        { val: mI },
        { var: 1 },
        { var: 2 },
      ],
    },
    { cmd: "GET", out: 0, var: 2, len: outputBytes },
  ];
}

function buildKlXTask(
  input: Uint8Array,
  inputXSize: number,
  localYSize: number,
  outputXSize: number,
  mI: number,
  rootX: Uint8Array,
  elementBytes: number,
): FfWorkerCommand[] {
  const outputBytes = outputXSize * localYSize * elementBytes;
  return [
    { cmd: "ALLOCSET", var: 0, buff: input },
    { cmd: "ALLOCSET", var: 1, buff: rootX },
    { cmd: "ALLOC", var: 2, len: outputBytes },
    {
      cmd: "CALL",
      fnName: KL_RECURRENCE_X,
      params: [
        { var: 0 },
        { val: inputXSize },
        { val: localYSize },
        { val: outputXSize },
        { val: mI },
        { var: 1 },
        { var: 2 },
      ],
    },
    { cmd: "GET", out: 0, var: 2, len: outputBytes },
  ];
}

function buildKlYTask(
  input: Uint8Array,
  xRows: number,
  inputYSize: number,
  outputYSize: number,
  sMax: number,
  rootY: Uint8Array,
  elementBytes: number,
): FfWorkerCommand[] {
  const outputBytes = xRows * outputYSize * elementBytes;
  return [
    { cmd: "ALLOCSET", var: 0, buff: input },
    { cmd: "ALLOCSET", var: 1, buff: rootY },
    { cmd: "ALLOC", var: 2, len: outputBytes },
    {
      cmd: "CALL",
      fnName: KL_RECURRENCE_Y,
      params: [
        { var: 0 },
        { val: xRows },
        { val: inputYSize },
        { val: outputYSize },
        { val: sMax },
        { var: 1 },
        { var: 2 },
      ],
    },
    { cmd: "GET", out: 0, var: 2, len: outputBytes },
  ];
}

function extractColumns(
  input: Uint8Array,
  xSize: number,
  ySize: number,
  start: number,
  count: number,
  elementBytes: number,
): Uint8Array {
  const output = new Uint8Array(xSize * count * elementBytes);
  for (let x = 0; x < xSize; x += 1) {
    const sourceOffset = (x * ySize + start) * elementBytes;
    output.set(
      input.subarray(sourceOffset, sourceOffset + count * elementBytes),
      x * count * elementBytes,
    );
  }
  return output;
}

function assembleColumns(
  shards: readonly Uint8Array[],
  ranges: readonly { readonly start: number; readonly count: number }[],
  xSize: number,
  ySize: number,
  elementBytes: number,
): Uint8Array {
  const output = new Uint8Array(xSize * ySize * elementBytes);
  for (let shardIndex = 0; shardIndex < shards.length; shardIndex += 1) {
    const shard = shards[shardIndex];
    const { start, count } = ranges[shardIndex];
    for (let x = 0; x < xSize; x += 1) {
      const sourceOffset = x * count * elementBytes;
      output.set(
        shard.subarray(sourceOffset, sourceOffset + count * elementBytes),
        (x * ySize + start) * elementBytes,
      );
    }
  }
  return output;
}

function concatSingleOutputs(
  results: readonly (readonly Uint8Array[])[],
  expectedBytes: number,
): Uint8Array {
  const output = new Uint8Array(expectedBytes);
  let offset = 0;
  for (const result of results) {
    const shard = requireOutputs(result, 1, "KL Y recurrence")[0];
    output.set(shard, offset);
    offset += shard.byteLength;
  }
  if (offset !== expectedBytes) {
    throw new Error(`KL Y output byte length mismatch: ${offset} !== ${expectedBytes}.`);
  }
  return output;
}

function splitRanges(total: number, requested: number): { start: number; count: number }[] {
  const count = Math.min(total, Math.max(1, requested));
  const base = Math.floor(total / count);
  const remainder = total % count;
  const ranges = [];
  let start = 0;
  for (let index = 0; index < count; index += 1) {
    const size = base + (index < remainder ? 1 : 0);
    ranges.push({ start, count: size });
    start += size;
  }
  return ranges;
}

function requireOutputs(
  outputs: readonly Uint8Array[],
  expected: number,
  label: string,
): readonly Uint8Array[] {
  if (outputs.length !== expected) {
    throw new Error(`${label} returned ${outputs.length} outputs; expected ${expected}.`);
  }
  return outputs;
}

function nextPowerOfTwo(value: number): number {
  let size = 1;
  while (size < value) {
    size *= 2;
  }
  return size;
}
