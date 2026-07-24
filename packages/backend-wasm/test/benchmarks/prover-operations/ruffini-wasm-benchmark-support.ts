import { getCurveFromName } from "ffjavascript";

import {
  BivariatePolynomialBuffer,
  type BivariateBufferRuffiniDivisionResult,
  type FieldElement,
} from "../../../src/index.js";
import type { FfField, FfWorkerCommand } from "../../../src/core/curve/curve.js";
import { createFieldRuntime, type FieldRuntime } from "../../../src/core/field/field.js";
import {
  installLinearBatchPlugin,
  type WasmModuleBuilder,
} from "../../../src/core/field/linear-batch-plugin.js";

const RUFFINI_X = "tokamak_bench_ruffiniX";
const RUFFINI_Y = "tokamak_bench_ruffiniY";

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
  call(name: string, ...params: unknown[]): unknown;
  br(depth: number): unknown;
  br_if(depth: number, condition: unknown): unknown;
  block(code: unknown): unknown;
  loop(...code: unknown[]): unknown;
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

export interface RuffiniBenchmarkRuntimes {
  readonly field: FieldRuntime;
  readonly singleField: FfField;
  readonly multiField: FfField;
  readonly workerCount: number;
  terminate(): Promise<void>;
}

interface XDivisionBuffers {
  readonly quotientX: Uint8Array;
  readonly xRemainder: Uint8Array;
}

interface YDivisionBuffers {
  readonly quotientY: Uint8Array;
  readonly remainder: Uint8Array;
}

export async function createRuffiniBenchmarkRuntimes(): Promise<RuffiniBenchmarkRuntimes> {
  const loadCurve = getCurveFromName as unknown as (
    name: string,
    singleThread: boolean,
    plugin: (module: WasmModuleBuilder) => void,
  ) => Promise<RawCurve>;
  const single = await loadCurve("bls12381", true, installRuffiniBenchmarkPlugin);
  const multi = await loadCurve("bls12381", false, installRuffiniBenchmarkPlugin);
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

export async function divideRuffiniWasmSingleTask(
  runtime: RuffiniBenchmarkRuntimes,
  polynomial: BivariatePolynomialBuffer,
  xPoint: FieldElement,
  yPoint: FieldElement,
): Promise<BivariateBufferRuffiniDivisionResult> {
  assertInputs(runtime.field, polynomial, xPoint, yPoint);
  const x = await runX(runtime.singleField, polynomial.coefficients, polynomial.xSize, polynomial.ySize, xPoint);
  const y = await runY(runtime.singleField, x.xRemainder, polynomial.ySize, yPoint);
  return wrapResult(runtime.field, polynomial, x.quotientX, y);
}

export async function divideRuffiniWasmWorkerShards(
  runtime: RuffiniBenchmarkRuntimes,
  polynomial: BivariatePolynomialBuffer,
  xPoint: FieldElement,
  yPoint: FieldElement,
): Promise<BivariateBufferRuffiniDivisionResult> {
  assertInputs(runtime.field, polynomial, xPoint, yPoint);
  const ranges = splitRanges(polynomial.ySize, runtime.workerCount);
  const shardResults = await Promise.all(ranges.map(async ({ start, count }) => {
    const input = extractColumns(
      polynomial.coefficients,
      polynomial.xSize,
      polynomial.ySize,
      start,
      count,
      runtime.field.byteLength,
    );
    return await runX(runtime.multiField, input, polynomial.xSize, count, xPoint);
  }));
  const quotientX = assembleColumns(
    shardResults.map((result) => result.quotientX),
    ranges,
    polynomial.xSize,
    polynomial.ySize,
    runtime.field.byteLength,
  );
  const xRemainder = new Uint8Array(polynomial.ySize * runtime.field.byteLength);
  for (let index = 0; index < ranges.length; index += 1) {
    xRemainder.set(shardResults[index].xRemainder, ranges[index].start * runtime.field.byteLength);
  }
  const y = await runY(runtime.multiField, xRemainder, polynomial.ySize, yPoint);
  return wrapResult(runtime.field, polynomial, quotientX, y);
}

export function singleTaskTemporaryBytes(
  xSize: number,
  ySize: number,
  elementBytes: number,
): number {
  const inputBytes = xSize * ySize * elementBytes;
  const quotientXBytes = inputBytes;
  const xRemainderBytes = ySize * elementBytes;
  const quotientYBytes = ySize * elementBytes;
  return inputBytes * 2 + quotientXBytes * 2 + xRemainderBytes * 4 + quotientYBytes * 2;
}

export function workerShardTemporaryBytes(
  xSize: number,
  ySize: number,
  elementBytes: number,
): number {
  const inputBytes = xSize * ySize * elementBytes;
  const quotientXBytes = inputBytes;
  const xRemainderBytes = ySize * elementBytes;
  const quotientYBytes = ySize * elementBytes;
  return inputBytes * 3 + quotientXBytes * 3 + xRemainderBytes * 5 + quotientYBytes * 2;
}

function installRuffiniBenchmarkPlugin(module: WasmModuleBuilder): void {
  installLinearBatchPlugin(module);
  buildRuffiniXKernel(module as unknown as ModuleBuilder);
  buildRuffiniYKernel(module as unknown as ModuleBuilder);
}

function buildRuffiniXKernel(module: ModuleBuilder): void {
  const fn = module.addFunction(RUFFINI_X);
  fn.addParam("pInput", "i32");
  fn.addParam("xSize", "i32");
  fn.addParam("ySize", "i32");
  fn.addParam("pPoint", "i32");
  fn.addParam("pQuotient", "i32");
  fn.addParam("pRemainder", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  const code = fn.getCodeBuilder();
  const temporary = code.i32_const(module.alloc(32));
  const elementPointer = (base: string, index: unknown) =>
    code.i32_add(code.getLocal(base), code.i32_mul(index, code.i32_const(32)));
  const index = (x: unknown, y: unknown) =>
    code.i32_add(code.i32_mul(x, code.getLocal("ySize")), y);

  fn.addCode(
    code.setLocal("y", code.i32_const(0)),
    code.block(
      code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("ySize"))),
        code.call(
          "frm_copy",
          elementPointer(
            "pInput",
            index(code.i32_sub(code.getLocal("xSize"), code.i32_const(1)), code.getLocal("y")),
          ),
          elementPointer(
            "pQuotient",
            index(code.i32_sub(code.getLocal("xSize"), code.i32_const(2)), code.getLocal("y")),
          ),
        ),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      ),
    ),
    code.setLocal("x", code.i32_sub(code.getLocal("xSize"), code.i32_const(2))),
    code.block(
      code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("x"), code.i32_const(0))),
        code.setLocal("x", code.i32_sub(code.getLocal("x"), code.i32_const(1))),
        code.setLocal("y", code.i32_const(0)),
        code.block(
          code.loop(
            code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("ySize"))),
            code.call(
              "frm_mul",
              code.getLocal("pPoint"),
              elementPointer(
                "pQuotient",
                index(code.i32_add(code.getLocal("x"), code.i32_const(1)), code.getLocal("y")),
              ),
              temporary,
            ),
            code.call(
              "frm_add",
              elementPointer(
                "pInput",
                index(code.i32_add(code.getLocal("x"), code.i32_const(1)), code.getLocal("y")),
              ),
              temporary,
              elementPointer("pQuotient", index(code.getLocal("x"), code.getLocal("y"))),
            ),
            code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
            code.br(0),
          ),
        ),
        code.br(0),
      ),
    ),
    code.setLocal("y", code.i32_const(0)),
    code.block(
      code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("ySize"))),
        code.call(
          "frm_mul",
          code.getLocal("pPoint"),
          elementPointer("pQuotient", code.getLocal("y")),
          temporary,
        ),
        code.call(
          "frm_add",
          elementPointer("pInput", code.getLocal("y")),
          temporary,
          elementPointer("pRemainder", code.getLocal("y")),
        ),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      ),
    ),
  );
  module.exportFunction(RUFFINI_X);
}

function buildRuffiniYKernel(module: ModuleBuilder): void {
  const fn = module.addFunction(RUFFINI_Y);
  fn.addParam("pInput", "i32");
  fn.addParam("ySize", "i32");
  fn.addParam("pPoint", "i32");
  fn.addParam("pQuotient", "i32");
  fn.addParam("pRemainder", "i32");
  fn.addLocal("y", "i32");
  const code = fn.getCodeBuilder();
  const temporary = code.i32_const(module.alloc(32));
  const elementPointer = (base: string, index: unknown) =>
    code.i32_add(code.getLocal(base), code.i32_mul(index, code.i32_const(32)));

  fn.addCode(
    code.call(
      "frm_copy",
      elementPointer("pInput", code.i32_sub(code.getLocal("ySize"), code.i32_const(1))),
      elementPointer("pQuotient", code.i32_sub(code.getLocal("ySize"), code.i32_const(2))),
    ),
    code.setLocal("y", code.i32_sub(code.getLocal("ySize"), code.i32_const(2))),
    code.block(
      code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.i32_const(0))),
        code.setLocal("y", code.i32_sub(code.getLocal("y"), code.i32_const(1))),
        code.call(
          "frm_mul",
          code.getLocal("pPoint"),
          elementPointer("pQuotient", code.i32_add(code.getLocal("y"), code.i32_const(1))),
          temporary,
        ),
        code.call(
          "frm_add",
          elementPointer("pInput", code.i32_add(code.getLocal("y"), code.i32_const(1))),
          temporary,
          elementPointer("pQuotient", code.getLocal("y")),
        ),
        code.br(0),
      ),
    ),
    code.call(
      "frm_mul",
      code.getLocal("pPoint"),
      code.getLocal("pQuotient"),
      temporary,
    ),
    code.call(
      "frm_add",
      code.getLocal("pInput"),
      temporary,
      code.getLocal("pRemainder"),
    ),
  );
  module.exportFunction(RUFFINI_Y);
}

async function runX(
  field: FfField,
  coefficients: Uint8Array,
  xSize: number,
  ySize: number,
  xPoint: FieldElement,
): Promise<XDivisionBuffers> {
  if (xSize === 1) {
    return {
      quotientX: new Uint8Array(coefficients.byteLength),
      xRemainder: coefficients.slice(),
    };
  }
  const result = await field.tm.queueAction(buildXTask(field, coefficients, xSize, ySize, xPoint));
  if (result.length !== 2) {
    throw new Error("Ruffini X task returned an invalid output set.");
  }
  return { quotientX: result[0], xRemainder: result[1] };
}

async function runY(
  field: FfField,
  xRemainder: Uint8Array,
  ySize: number,
  yPoint: FieldElement,
): Promise<YDivisionBuffers> {
  if (ySize === 1) {
    return {
      quotientY: new Uint8Array(field.n8),
      remainder: xRemainder.slice(0, field.n8),
    };
  }
  const result = await field.tm.queueAction(buildYTask(field, xRemainder, ySize, yPoint));
  if (result.length !== 2 || result[1].byteLength !== field.n8) {
    throw new Error("Ruffini Y task returned an invalid output set.");
  }
  return { quotientY: result[0], remainder: result[1] };
}

function buildXTask(
  field: FfField,
  coefficients: Uint8Array,
  xSize: number,
  ySize: number,
  xPoint: FieldElement,
): FfWorkerCommand[] {
  const quotientBytes = coefficients.byteLength;
  const remainderBytes = ySize * field.n8;
  return [
    { cmd: "ALLOCSET", var: 0, buff: coefficients },
    { cmd: "ALLOCSET", var: 1, buff: xPoint },
    { cmd: "ALLOCSET", var: 2, buff: new Uint8Array(quotientBytes) },
    { cmd: "ALLOC", var: 3, len: remainderBytes },
    {
      cmd: "CALL",
      fnName: RUFFINI_X,
      params: [
        { var: 0 },
        { val: xSize },
        { val: ySize },
        { var: 1 },
        { var: 2 },
        { var: 3 },
      ],
    },
    { cmd: "GET", out: 0, var: 2, len: quotientBytes },
    { cmd: "GET", out: 1, var: 3, len: remainderBytes },
  ];
}

function buildYTask(
  field: FfField,
  xRemainder: Uint8Array,
  ySize: number,
  yPoint: FieldElement,
): FfWorkerCommand[] {
  const quotientBytes = ySize * field.n8;
  return [
    { cmd: "ALLOCSET", var: 0, buff: xRemainder },
    { cmd: "ALLOCSET", var: 1, buff: yPoint },
    { cmd: "ALLOCSET", var: 2, buff: new Uint8Array(quotientBytes) },
    { cmd: "ALLOC", var: 3, len: field.n8 },
    {
      cmd: "CALL",
      fnName: RUFFINI_Y,
      params: [{ var: 0 }, { val: ySize }, { var: 1 }, { var: 2 }, { var: 3 }],
    },
    { cmd: "GET", out: 0, var: 2, len: quotientBytes },
    { cmd: "GET", out: 1, var: 3, len: field.n8 },
  ];
}

function wrapResult(
  field: FieldRuntime,
  polynomial: BivariatePolynomialBuffer,
  quotientX: Uint8Array,
  y: YDivisionBuffers,
): BivariateBufferRuffiniDivisionResult {
  return {
    quotientX: BivariatePolynomialBuffer.fromOwnedBuffer(
      field,
      quotientX,
      polynomial.xSize,
      polynomial.ySize,
    ),
    quotientY: BivariatePolynomialBuffer.fromOwnedBuffer(field, y.quotientY, 1, polynomial.ySize),
    remainder: y.remainder,
  };
}

function extractColumns(
  source: Uint8Array,
  xSize: number,
  sourceYSize: number,
  yStart: number,
  yCount: number,
  elementBytes: number,
): Uint8Array {
  const output = new Uint8Array(xSize * yCount * elementBytes);
  for (let x = 0; x < xSize; x += 1) {
    const sourceStart = (x * sourceYSize + yStart) * elementBytes;
    output.set(
      source.subarray(sourceStart, sourceStart + yCount * elementBytes),
      x * yCount * elementBytes,
    );
  }
  return output;
}

function assembleColumns(
  shards: readonly Uint8Array[],
  ranges: readonly { start: number; count: number }[],
  xSize: number,
  ySize: number,
  elementBytes: number,
): Uint8Array {
  const output = new Uint8Array(xSize * ySize * elementBytes);
  for (let shardIndex = 0; shardIndex < shards.length; shardIndex += 1) {
    const { start, count } = ranges[shardIndex];
    const shard = shards[shardIndex];
    for (let x = 0; x < xSize; x += 1) {
      output.set(
        shard.subarray(x * count * elementBytes, (x + 1) * count * elementBytes),
        (x * ySize + start) * elementBytes,
      );
    }
  }
  return output;
}

function splitRanges(
  length: number,
  requestedCount: number,
): readonly { start: number; count: number }[] {
  const count = Math.min(length, Math.max(1, requestedCount));
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((length * index) / count);
    const end = Math.floor((length * (index + 1)) / count);
    return { start, count: end - start };
  });
}

function assertInputs(
  field: FieldRuntime,
  polynomial: BivariatePolynomialBuffer,
  xPoint: FieldElement,
  yPoint: FieldElement,
): void {
  if (polynomial.field !== field) {
    throw new Error("Ruffini benchmark polynomial belongs to a different field runtime.");
  }
  if (xPoint.byteLength !== field.byteLength || yPoint.byteLength !== field.byteLength) {
    throw new Error("Ruffini division points must be field elements.");
  }
}
