import { getCurveFromName } from "ffjavascript";

import {
  BivariatePolynomialBuffer,
  type FieldElement,
} from "../../../src/index.js";
import type { FfField, FfWorkerCommand } from "../../../src/core/curve/curve.js";
import { createFieldRuntime, type FieldRuntime } from "../../../src/core/field/field.js";
import {
  installLinearBatchPlugin,
  type WasmModuleBuilder,
} from "../../../src/core/field/linear-batch-plugin.js";

const EVAL_SINGLE = "tokamak_bench_evalSingle";
const EVAL_ROWS_SINGLE = "tokamak_bench_evalRowsSingle";
const EVAL_FUSED = "tokamak_bench_evalFused";
const EVAL_ROWS_FUSED = "tokamak_bench_evalRowsFused";
const EVAL_REDUCE_SINGLE = "tokamak_bench_evalReduceSingle";
const EVAL_REDUCE_FUSED = "tokamak_bench_evalReduceFused";

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

export interface EvaluationBenchmarkRuntimes {
  readonly field: FieldRuntime;
  readonly singleField: FfField;
  readonly multiField: FfField;
  readonly workerCount: number;
  terminate(): Promise<void>;
}

export async function createEvaluationBenchmarkRuntimes(): Promise<EvaluationBenchmarkRuntimes> {
  const loadCurve = getCurveFromName as unknown as (
    name: string,
    singleThread: boolean,
    plugin: (module: WasmModuleBuilder) => void,
  ) => Promise<RawCurve>;
  const single = await loadCurve("bls12381", true, installEvaluationBenchmarkPlugin);
  const multi = await loadCurve("bls12381", false, installEvaluationBenchmarkPlugin);
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

export async function evaluateSingleWasmTask(
  runtime: EvaluationBenchmarkRuntimes,
  polynomial: BivariatePolynomialBuffer,
  xPoint: FieldElement,
  yPoint: FieldElement,
): Promise<FieldElement> {
  assertInputs(runtime.field, polynomial, xPoint, yPoint);
  const outputs = await runtime.singleField.tm.queueAction([
    { cmd: "ALLOCSET", var: 0, buff: polynomial.coefficients },
    { cmd: "ALLOCSET", var: 1, buff: xPoint },
    { cmd: "ALLOCSET", var: 2, buff: yPoint },
    { cmd: "ALLOC", var: 3, len: runtime.field.byteLength },
    {
      cmd: "CALL",
      fnName: EVAL_SINGLE,
      params: [
        { var: 0 },
        { val: polynomial.xSize },
        { val: polynomial.ySize },
        { var: 1 },
        { var: 2 },
        { var: 3 },
      ],
    },
    { cmd: "GET", out: 0, var: 3, len: runtime.field.byteLength },
  ]);
  return requireOutputs(outputs, 1, "single evaluation")[0];
}

export async function evaluateSingleWasmWorkers(
  runtime: EvaluationBenchmarkRuntimes,
  polynomial: BivariatePolynomialBuffer,
  xPoint: FieldElement,
  yPoint: FieldElement,
): Promise<FieldElement> {
  assertInputs(runtime.field, polynomial, xPoint, yPoint);
  const ranges = splitRanges(polynomial.xSize, runtime.workerCount);
  const rowResults = await Promise.all(ranges.map(({ start, count }) => {
    const input = polynomial.coefficients.slice(
      start * polynomial.ySize * runtime.field.byteLength,
      (start + count) * polynomial.ySize * runtime.field.byteLength,
    );
    return runtime.multiField.tm.queueAction([
      { cmd: "ALLOCSET", var: 0, buff: input },
      { cmd: "ALLOCSET", var: 1, buff: yPoint },
      { cmd: "ALLOC", var: 2, len: count * runtime.field.byteLength },
      {
        cmd: "CALL",
        fnName: EVAL_ROWS_SINGLE,
        params: [{ var: 0 }, { val: count }, { val: polynomial.ySize }, { var: 1 }, { var: 2 }],
      },
      { cmd: "GET", out: 0, var: 2, len: count * runtime.field.byteLength },
    ]);
  }));
  const rows = assembleRows(rowResults, ranges, polynomial.xSize, runtime.field.byteLength, 1)[0];
  const outputs = await runtime.multiField.tm.queueAction([
    { cmd: "ALLOCSET", var: 0, buff: rows },
    { cmd: "ALLOCSET", var: 1, buff: xPoint },
    { cmd: "ALLOC", var: 2, len: runtime.field.byteLength },
    {
      cmd: "CALL",
      fnName: EVAL_REDUCE_SINGLE,
      params: [{ var: 0 }, { val: polynomial.xSize }, { var: 1 }, { var: 2 }],
    },
    { cmd: "GET", out: 0, var: 2, len: runtime.field.byteLength },
  ]);
  return requireOutputs(outputs, 1, "single evaluation reduction")[0];
}

export async function evaluateFusedWasmTask(
  runtime: EvaluationBenchmarkRuntimes,
  polynomial: BivariatePolynomialBuffer,
  xPoint: FieldElement,
  scaledXPoint: FieldElement,
  yPoint: FieldElement,
  scaledYPoint: FieldElement,
): Promise<readonly [FieldElement, FieldElement, FieldElement]> {
  assertInputs(runtime.field, polynomial, xPoint, yPoint);
  assertElement(runtime.field, scaledXPoint, "Scaled X point");
  assertElement(runtime.field, scaledYPoint, "Scaled Y point");
  const outputs = await runtime.singleField.tm.queueAction([
    { cmd: "ALLOCSET", var: 0, buff: polynomial.coefficients },
    { cmd: "ALLOCSET", var: 1, buff: xPoint },
    { cmd: "ALLOCSET", var: 2, buff: scaledXPoint },
    { cmd: "ALLOCSET", var: 3, buff: yPoint },
    { cmd: "ALLOCSET", var: 4, buff: scaledYPoint },
    { cmd: "ALLOC", var: 5, len: runtime.field.byteLength },
    { cmd: "ALLOC", var: 6, len: runtime.field.byteLength },
    { cmd: "ALLOC", var: 7, len: runtime.field.byteLength },
    {
      cmd: "CALL",
      fnName: EVAL_FUSED,
      params: [
        { var: 0 },
        { val: polynomial.xSize },
        { val: polynomial.ySize },
        { var: 1 },
        { var: 2 },
        { var: 3 },
        { var: 4 },
        { var: 5 },
        { var: 6 },
        { var: 7 },
      ],
    },
    { cmd: "GET", out: 0, var: 5, len: runtime.field.byteLength },
    { cmd: "GET", out: 1, var: 6, len: runtime.field.byteLength },
    { cmd: "GET", out: 2, var: 7, len: runtime.field.byteLength },
  ]);
  return requireTriple(outputs, "fused evaluation");
}

export async function evaluateFusedWasmWorkers(
  runtime: EvaluationBenchmarkRuntimes,
  polynomial: BivariatePolynomialBuffer,
  xPoint: FieldElement,
  scaledXPoint: FieldElement,
  yPoint: FieldElement,
  scaledYPoint: FieldElement,
): Promise<readonly [FieldElement, FieldElement, FieldElement]> {
  assertInputs(runtime.field, polynomial, xPoint, yPoint);
  assertElement(runtime.field, scaledXPoint, "Scaled X point");
  assertElement(runtime.field, scaledYPoint, "Scaled Y point");
  const ranges = splitRanges(polynomial.xSize, runtime.workerCount);
  const rowResults = await Promise.all(ranges.map(({ start, count }) => {
    const input = polynomial.coefficients.slice(
      start * polynomial.ySize * runtime.field.byteLength,
      (start + count) * polynomial.ySize * runtime.field.byteLength,
    );
    return runtime.multiField.tm.queueAction([
      { cmd: "ALLOCSET", var: 0, buff: input },
      { cmd: "ALLOCSET", var: 1, buff: yPoint },
      { cmd: "ALLOCSET", var: 2, buff: scaledYPoint },
      { cmd: "ALLOC", var: 3, len: count * runtime.field.byteLength },
      { cmd: "ALLOC", var: 4, len: count * runtime.field.byteLength },
      {
        cmd: "CALL",
        fnName: EVAL_ROWS_FUSED,
        params: [
          { var: 0 },
          { val: count },
          { val: polynomial.ySize },
          { var: 1 },
          { var: 2 },
          { var: 3 },
          { var: 4 },
        ],
      },
      { cmd: "GET", out: 0, var: 3, len: count * runtime.field.byteLength },
      { cmd: "GET", out: 1, var: 4, len: count * runtime.field.byteLength },
    ]);
  }));
  const [baseRows, scaledRows] = assembleRows(
    rowResults,
    ranges,
    polynomial.xSize,
    runtime.field.byteLength,
    2,
  );
  const outputs = await runtime.multiField.tm.queueAction([
    { cmd: "ALLOCSET", var: 0, buff: baseRows },
    { cmd: "ALLOCSET", var: 1, buff: scaledRows },
    { cmd: "ALLOCSET", var: 2, buff: xPoint },
    { cmd: "ALLOCSET", var: 3, buff: scaledXPoint },
    { cmd: "ALLOC", var: 4, len: runtime.field.byteLength },
    { cmd: "ALLOC", var: 5, len: runtime.field.byteLength },
    { cmd: "ALLOC", var: 6, len: runtime.field.byteLength },
    {
      cmd: "CALL",
      fnName: EVAL_REDUCE_FUSED,
      params: [
        { var: 0 },
        { var: 1 },
        { val: polynomial.xSize },
        { var: 2 },
        { var: 3 },
        { var: 4 },
        { var: 5 },
        { var: 6 },
      ],
    },
    { cmd: "GET", out: 0, var: 4, len: runtime.field.byteLength },
    { cmd: "GET", out: 1, var: 5, len: runtime.field.byteLength },
    { cmd: "GET", out: 2, var: 6, len: runtime.field.byteLength },
  ]);
  return requireTriple(outputs, "fused evaluation reduction");
}

export function evaluationTaskTemporaryBytes(inputBytes: number, elementBytes: number): number {
  return inputBytes * 2 + elementBytes * 6;
}

export function evaluationWorkerTemporaryBytes(
  inputBytes: number,
  xSize: number,
  elementBytes: number,
  fused: boolean,
): number {
  const rowBytes = xSize * elementBytes * (fused ? 2 : 1);
  return inputBytes * 2 + rowBytes * 3 + elementBytes * 12;
}

function installEvaluationBenchmarkPlugin(module: WasmModuleBuilder): void {
  installLinearBatchPlugin(module);
  const builder = module as unknown as ModuleBuilder;
  buildEvalSingleKernel(builder);
  buildEvalRowsSingleKernel(builder);
  buildEvalFusedKernel(builder);
  buildEvalRowsFusedKernel(builder);
  buildEvalReduceSingleKernel(builder);
  buildEvalReduceFusedKernel(builder);
}

function buildEvalSingleKernel(module: ModuleBuilder): void {
  const fn = module.addFunction(EVAL_SINGLE);
  addPolynomialEvalParams(fn, true);
  fn.addParam("pOut", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  const code = fn.getCodeBuilder();
  const row = code.i32_const(module.alloc(32));
  const temporary = code.i32_const(module.alloc(32));
  fn.addCode(
    code.call("frm_zero", code.getLocal("pOut")),
    ...nestedHornerLoop(code, row, temporary, "pOut"),
  );
  module.exportFunction(EVAL_SINGLE);
}

function buildEvalRowsSingleKernel(module: ModuleBuilder): void {
  const fn = module.addFunction(EVAL_ROWS_SINGLE);
  fn.addParam("pInput", "i32");
  fn.addParam("xSize", "i32");
  fn.addParam("ySize", "i32");
  fn.addParam("pY", "i32");
  fn.addParam("pRows", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  const code = fn.getCodeBuilder();
  const temporary = code.i32_const(module.alloc(32));
  fn.addCode(...rowHornerLoop(code, temporary, "pY", "pRows"));
  module.exportFunction(EVAL_ROWS_SINGLE);
}

function buildEvalFusedKernel(module: ModuleBuilder): void {
  const fn = module.addFunction(EVAL_FUSED);
  fn.addParam("pInput", "i32");
  fn.addParam("xSize", "i32");
  fn.addParam("ySize", "i32");
  fn.addParam("pX", "i32");
  fn.addParam("pScaledX", "i32");
  fn.addParam("pY", "i32");
  fn.addParam("pScaledY", "i32");
  fn.addParam("pBaseOut", "i32");
  fn.addParam("pScaledXOut", "i32");
  fn.addParam("pScaledXYOut", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  const code = fn.getCodeBuilder();
  const baseRow = code.i32_const(module.alloc(32));
  const scaledRow = code.i32_const(module.alloc(32));
  const temporary = code.i32_const(module.alloc(32));
  fn.addCode(
    code.call("frm_zero", code.getLocal("pBaseOut")),
    code.call("frm_zero", code.getLocal("pScaledXOut")),
    code.call("frm_zero", code.getLocal("pScaledXYOut")),
    ...fusedNestedHornerLoop(code, baseRow, scaledRow, temporary),
  );
  module.exportFunction(EVAL_FUSED);
}

function buildEvalRowsFusedKernel(module: ModuleBuilder): void {
  const fn = module.addFunction(EVAL_ROWS_FUSED);
  fn.addParam("pInput", "i32");
  fn.addParam("xSize", "i32");
  fn.addParam("ySize", "i32");
  fn.addParam("pY", "i32");
  fn.addParam("pScaledY", "i32");
  fn.addParam("pBaseRows", "i32");
  fn.addParam("pScaledRows", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  const code = fn.getCodeBuilder();
  const temporary = code.i32_const(module.alloc(32));
  fn.addCode(...fusedRowHornerLoop(code, temporary));
  module.exportFunction(EVAL_ROWS_FUSED);
}

function buildEvalReduceSingleKernel(module: ModuleBuilder): void {
  const fn = module.addFunction(EVAL_REDUCE_SINGLE);
  fn.addParam("pRows", "i32");
  fn.addParam("xSize", "i32");
  fn.addParam("pX", "i32");
  fn.addParam("pOut", "i32");
  fn.addLocal("x", "i32");
  const code = fn.getCodeBuilder();
  const temporary = code.i32_const(module.alloc(32));
  fn.addCode(...reduceRowsLoop(code, temporary, "pRows", "pX", "pOut"));
  module.exportFunction(EVAL_REDUCE_SINGLE);
}

function buildEvalReduceFusedKernel(module: ModuleBuilder): void {
  const fn = module.addFunction(EVAL_REDUCE_FUSED);
  fn.addParam("pBaseRows", "i32");
  fn.addParam("pScaledRows", "i32");
  fn.addParam("xSize", "i32");
  fn.addParam("pX", "i32");
  fn.addParam("pScaledX", "i32");
  fn.addParam("pBaseOut", "i32");
  fn.addParam("pScaledXOut", "i32");
  fn.addParam("pScaledXYOut", "i32");
  fn.addLocal("x", "i32");
  const code = fn.getCodeBuilder();
  const temporary = code.i32_const(module.alloc(32));
  fn.addCode(
    ...reduceRowsLoop(code, temporary, "pBaseRows", "pX", "pBaseOut"),
    ...reduceRowsLoop(code, temporary, "pBaseRows", "pScaledX", "pScaledXOut"),
    ...reduceRowsLoop(code, temporary, "pScaledRows", "pScaledX", "pScaledXYOut"),
  );
  module.exportFunction(EVAL_REDUCE_FUSED);
}

function addPolynomialEvalParams(fn: FunctionBuilder, includeX: boolean): void {
  fn.addParam("pInput", "i32");
  fn.addParam("xSize", "i32");
  fn.addParam("ySize", "i32");
  if (includeX) {
    fn.addParam("pX", "i32");
  }
  fn.addParam("pY", "i32");
}

function nestedHornerLoop(
  code: WasmCodeBuilder,
  row: unknown,
  temporary: unknown,
  output: string,
): unknown[] {
  return [
    code.setLocal("x", code.getLocal("xSize")),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("x"), code.i32_const(0))),
      code.setLocal("x", code.i32_sub(code.getLocal("x"), code.i32_const(1))),
      code.call("frm_zero", row),
      code.setLocal("y", code.getLocal("ySize")),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.i32_const(0))),
        code.setLocal("y", code.i32_sub(code.getLocal("y"), code.i32_const(1))),
        code.call("frm_mul", row, code.getLocal("pY"), temporary),
        code.call("frm_add", coefficientPointer(code, "pInput"), temporary, row),
        code.br(0),
      )),
      code.call("frm_mul", code.getLocal(output), code.getLocal("pX"), temporary),
      code.call("frm_add", row, temporary, code.getLocal(output)),
      code.br(0),
    )),
  ];
}

function rowHornerLoop(
  code: WasmCodeBuilder,
  temporary: unknown,
  point: string,
  output: string,
): unknown[] {
  return [
    code.setLocal("x", code.i32_const(0)),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("xSize"))),
      code.call("frm_zero", rowPointer(code, output)),
      code.setLocal("y", code.getLocal("ySize")),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.i32_const(0))),
        code.setLocal("y", code.i32_sub(code.getLocal("y"), code.i32_const(1))),
        code.call("frm_mul", rowPointer(code, output), code.getLocal(point), temporary),
        code.call("frm_add", coefficientPointer(code, "pInput"), temporary, rowPointer(code, output)),
        code.br(0),
      )),
      code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
      code.br(0),
    )),
  ];
}

function fusedNestedHornerLoop(
  code: WasmCodeBuilder,
  baseRow: unknown,
  scaledRow: unknown,
  temporary: unknown,
): unknown[] {
  return [
    code.setLocal("x", code.getLocal("xSize")),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("x"), code.i32_const(0))),
      code.setLocal("x", code.i32_sub(code.getLocal("x"), code.i32_const(1))),
      code.call("frm_zero", baseRow),
      code.call("frm_zero", scaledRow),
      code.setLocal("y", code.getLocal("ySize")),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.i32_const(0))),
        code.setLocal("y", code.i32_sub(code.getLocal("y"), code.i32_const(1))),
        code.call("frm_mul", baseRow, code.getLocal("pY"), temporary),
        code.call("frm_add", coefficientPointer(code, "pInput"), temporary, baseRow),
        code.call("frm_mul", scaledRow, code.getLocal("pScaledY"), temporary),
        code.call("frm_add", coefficientPointer(code, "pInput"), temporary, scaledRow),
        code.br(0),
      )),
      code.call("frm_mul", code.getLocal("pBaseOut"), code.getLocal("pX"), temporary),
      code.call("frm_add", baseRow, temporary, code.getLocal("pBaseOut")),
      code.call("frm_mul", code.getLocal("pScaledXOut"), code.getLocal("pScaledX"), temporary),
      code.call("frm_add", baseRow, temporary, code.getLocal("pScaledXOut")),
      code.call("frm_mul", code.getLocal("pScaledXYOut"), code.getLocal("pScaledX"), temporary),
      code.call("frm_add", scaledRow, temporary, code.getLocal("pScaledXYOut")),
      code.br(0),
    )),
  ];
}

function fusedRowHornerLoop(code: WasmCodeBuilder, temporary: unknown): unknown[] {
  return [
    code.setLocal("x", code.i32_const(0)),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("xSize"))),
      code.call("frm_zero", rowPointer(code, "pBaseRows")),
      code.call("frm_zero", rowPointer(code, "pScaledRows")),
      code.setLocal("y", code.getLocal("ySize")),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.i32_const(0))),
        code.setLocal("y", code.i32_sub(code.getLocal("y"), code.i32_const(1))),
        code.call("frm_mul", rowPointer(code, "pBaseRows"), code.getLocal("pY"), temporary),
        code.call("frm_add", coefficientPointer(code, "pInput"), temporary, rowPointer(code, "pBaseRows")),
        code.call("frm_mul", rowPointer(code, "pScaledRows"), code.getLocal("pScaledY"), temporary),
        code.call("frm_add", coefficientPointer(code, "pInput"), temporary, rowPointer(code, "pScaledRows")),
        code.br(0),
      )),
      code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
      code.br(0),
    )),
  ];
}

function reduceRowsLoop(
  code: WasmCodeBuilder,
  temporary: unknown,
  rows: string,
  point: string,
  output: string,
): unknown[] {
  return [
    code.call("frm_zero", code.getLocal(output)),
    code.setLocal("x", code.getLocal("xSize")),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("x"), code.i32_const(0))),
      code.setLocal("x", code.i32_sub(code.getLocal("x"), code.i32_const(1))),
      code.call("frm_mul", code.getLocal(output), code.getLocal(point), temporary),
      code.call("frm_add", rowPointer(code, rows), temporary, code.getLocal(output)),
      code.br(0),
    )),
  ];
}

function coefficientPointer(code: WasmCodeBuilder, base: string): unknown {
  return code.i32_add(
    code.getLocal(base),
    code.i32_mul(
      code.i32_add(
        code.i32_mul(code.getLocal("x"), code.getLocal("ySize")),
        code.getLocal("y"),
      ),
      code.i32_const(32),
    ),
  );
}

function rowPointer(code: WasmCodeBuilder, base: string): unknown {
  return code.i32_add(
    code.getLocal(base),
    code.i32_mul(code.getLocal("x"), code.i32_const(32)),
  );
}

function assembleRows(
  results: readonly Uint8Array[][],
  ranges: readonly { readonly start: number; readonly count: number }[],
  xSize: number,
  elementBytes: number,
  outputCount: number,
): Uint8Array[] {
  const outputs = Array.from({ length: outputCount }, () => new Uint8Array(xSize * elementBytes));
  for (let index = 0; index < ranges.length; index += 1) {
    const shard = requireOutputs(results[index], outputCount, "evaluation row shard");
    for (let outputIndex = 0; outputIndex < outputCount; outputIndex += 1) {
      outputs[outputIndex].set(shard[outputIndex], ranges[index].start * elementBytes);
    }
  }
  return outputs;
}

function splitRanges(total: number, concurrency: number): { readonly start: number; readonly count: number }[] {
  const rangeCount = Math.min(total, Math.max(1, concurrency));
  const base = Math.floor(total / rangeCount);
  const remainder = total % rangeCount;
  const ranges: { start: number; count: number }[] = [];
  let start = 0;
  for (let index = 0; index < rangeCount; index += 1) {
    const count = base + (index < remainder ? 1 : 0);
    ranges.push({ start, count });
    start += count;
  }
  return ranges;
}

function requireTriple(
  outputs: readonly Uint8Array[],
  label: string,
): readonly [FieldElement, FieldElement, FieldElement] {
  const values = requireOutputs(outputs, 3, label);
  return [values[0], values[1], values[2]];
}

function requireOutputs(
  outputs: readonly Uint8Array[],
  count: number,
  label: string,
): Uint8Array[] {
  if (outputs.length !== count) {
    throw new Error(`${label} returned ${outputs.length} outputs; expected ${count}.`);
  }
  return [...outputs];
}

function assertInputs(
  field: FieldRuntime,
  polynomial: BivariatePolynomialBuffer,
  xPoint: FieldElement,
  yPoint: FieldElement,
): void {
  if (polynomial.field !== field) {
    throw new Error("Evaluation benchmark polynomial belongs to a different field.");
  }
  assertElement(field, xPoint, "X point");
  assertElement(field, yPoint, "Y point");
}

function assertElement(field: FieldRuntime, value: FieldElement, label: string): void {
  if (value.byteLength !== field.byteLength) {
    throw new Error(`${label} does not match the benchmark field width.`);
  }
}
