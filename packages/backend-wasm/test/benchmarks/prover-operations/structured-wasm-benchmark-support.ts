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
const SPECIAL_X_MINUS_ONE = "tokamak_bench_xMinusOne";
const SPECIAL_ONE_MINUS_X = "tokamak_bench_oneMinusX";
const SPECIAL_LINEAR_X = "tokamak_bench_linearX";
const SPECIAL_LINEAR_Y = "tokamak_bench_linearY";
const SPECIAL_TERM9 = "tokamak_bench_term9";
const FUSED_LINEAR_X = "tokamak_bench_fusedLinearX";
const FUSED_LINEAR_Y = "tokamak_bench_fusedLinearY";

export type SpecialOperation =
  | "x-minus-one"
  | "one-minus-x"
  | "linear-x"
  | "linear-y"
  | "term9";

export interface SpecialCoefficients {
  readonly constant: Uint8Array;
  readonly x: Uint8Array;
  readonly y: Uint8Array;
}

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

export async function multiplySpecialWasmSingle(
  runtime: StructuredBenchmarkRuntimes,
  polynomial: BivariatePolynomialBuffer,
  operation: SpecialOperation,
  coefficients: SpecialCoefficients,
): Promise<BivariatePolynomialBuffer> {
  return multiplySpecial(runtime, runtime.singleField, polynomial, operation, coefficients, 1);
}

export async function multiplySpecialWasmOneWorker(
  runtime: StructuredBenchmarkRuntimes,
  polynomial: BivariatePolynomialBuffer,
  operation: SpecialOperation,
  coefficients: SpecialCoefficients,
): Promise<BivariatePolynomialBuffer> {
  return multiplySpecial(runtime, runtime.multiField, polynomial, operation, coefficients, 1);
}

export async function multiplySpecialWasmWorkers(
  runtime: StructuredBenchmarkRuntimes,
  polynomial: BivariatePolynomialBuffer,
  operation: SpecialOperation,
  coefficients: SpecialCoefficients,
): Promise<BivariatePolynomialBuffer> {
  return multiplySpecial(
    runtime,
    runtime.multiField,
    polynomial,
    operation,
    coefficients,
    runtime.workerCount,
  );
}

export function specialTemporaryBytes(
  inputBytes: number,
  outputBytes: number,
  taskCount: number,
): number {
  return outputBytes * 2 + inputBytes + (taskCount > 1 ? inputBytes : 0);
}

export async function multiplyFusedLinearWasmSingle(
  runtime: StructuredBenchmarkRuntimes,
  polynomial: BivariatePolynomialBuffer,
  addend: BivariatePolynomialBuffer,
  coefficients: readonly [Uint8Array, Uint8Array],
  addendScale: Uint8Array,
  axis: "x" | "y",
): Promise<BivariatePolynomialBuffer> {
  return multiplyFusedLinear(
    runtime,
    runtime.singleField,
    polynomial,
    addend,
    coefficients,
    addendScale,
    axis,
    1,
  );
}

export async function multiplyFusedLinearWasmOneWorker(
  runtime: StructuredBenchmarkRuntimes,
  polynomial: BivariatePolynomialBuffer,
  addend: BivariatePolynomialBuffer,
  coefficients: readonly [Uint8Array, Uint8Array],
  addendScale: Uint8Array,
  axis: "x" | "y",
): Promise<BivariatePolynomialBuffer> {
  return multiplyFusedLinear(
    runtime,
    runtime.multiField,
    polynomial,
    addend,
    coefficients,
    addendScale,
    axis,
    1,
  );
}

export async function multiplyFusedLinearWasmWorkers(
  runtime: StructuredBenchmarkRuntimes,
  polynomial: BivariatePolynomialBuffer,
  addend: BivariatePolynomialBuffer,
  coefficients: readonly [Uint8Array, Uint8Array],
  addendScale: Uint8Array,
  axis: "x" | "y",
): Promise<BivariatePolynomialBuffer> {
  return multiplyFusedLinear(
    runtime,
    runtime.multiField,
    polynomial,
    addend,
    coefficients,
    addendScale,
    axis,
    runtime.workerCount,
  );
}

async function multiplySpecial(
  runtime: StructuredBenchmarkRuntimes,
  rawField: FfField,
  polynomial: BivariatePolynomialBuffer,
  operation: SpecialOperation,
  coefficients: SpecialCoefficients,
  taskCount: number,
): Promise<BivariatePolynomialBuffer> {
  const degree = polynomial.findDegree();
  if (degree.xDegree < 0 || degree.yDegree < 0) {
    return BivariatePolynomialBuffer.zero(runtime.field);
  }
  const extendsX = operation !== "linear-y";
  const extendsY = operation === "linear-y" || operation === "term9";
  const activeX = degree.xDegree + 1;
  const activeY = degree.yDegree + 1;
  const activeOutputX = activeX + (extendsX ? 1 : 0);
  const activeOutputY = activeY + (extendsY ? 1 : 0);
  const outputXSize = extendsX
    ? Math.max(polynomial.xSize, nextPowerOfTwo(activeOutputX))
    : polynomial.xSize;
  const outputYSize = extendsY
    ? Math.max(polynomial.ySize, nextPowerOfTwo(activeOutputY))
    : polynomial.ySize;
  const ranges = splitRanges(activeOutputX, taskCount);
  const functionName = specialFunctionName(operation);
  const sourceRowBytes = polynomial.ySize * runtime.field.byteLength;
  const results = await Promise.all(ranges.map(({ start, count }) => {
    const sourceStart = Math.max(0, start - 1);
    const sourceEnd = Math.min(activeX, start + count);
    const source = sourceStart < sourceEnd
      ? polynomial.coefficients.slice(sourceStart * sourceRowBytes, sourceEnd * sourceRowBytes)
      : new Uint8Array(0);
    return rawField.tm.queueAction(buildSpecialTask(
      source,
      sourceStart,
      sourceEnd - sourceStart,
      polynomial.ySize,
      start,
      count,
      activeX,
      activeY,
      activeOutputY,
      functionName,
      coefficients,
      runtime.field.byteLength,
    ));
  }));
  const output = new Uint8Array(outputXSize * outputYSize * runtime.field.byteLength);
  for (let index = 0; index < ranges.length; index += 1) {
    const shard = requireOutputs(results[index], 1, operation)[0];
    const { start, count } = ranges[index];
    for (let localX = 0; localX < count; localX += 1) {
      const sourceOffset = localX * activeOutputY * runtime.field.byteLength;
      output.set(
        shard.subarray(
          sourceOffset,
          sourceOffset + activeOutputY * runtime.field.byteLength,
        ),
        (start + localX) * outputYSize * runtime.field.byteLength,
      );
    }
  }
  return BivariatePolynomialBuffer.fromOwnedBuffer(
    runtime.field,
    output,
    outputXSize,
    outputYSize,
  );
}

async function multiplyFusedLinear(
  runtime: StructuredBenchmarkRuntimes,
  rawField: FfField,
  polynomial: BivariatePolynomialBuffer,
  addend: BivariatePolynomialBuffer,
  coefficients: readonly [Uint8Array, Uint8Array],
  addendScale: Uint8Array,
  axis: "x" | "y",
  taskCount: number,
): Promise<BivariatePolynomialBuffer> {
  if (polynomial.field !== addend.field) {
    throw new Error("Fused linear benchmark inputs must use one field.");
  }
  const degree = polynomial.findDegree();
  if (degree.xDegree < 0 || degree.yDegree < 0) {
    return addend.scale(addendScale);
  }
  const activeX = degree.xDegree + 1;
  const activeY = degree.yDegree + 1;
  const activeOutputX = activeX + (axis === "x" ? 1 : 0);
  const activeOutputY = activeY + (axis === "y" ? 1 : 0);
  const outputXSize = axis === "x"
    ? Math.max(polynomial.xSize, nextPowerOfTwo(activeOutputX))
    : polynomial.xSize;
  const outputYSize = axis === "y"
    ? Math.max(polynomial.ySize, nextPowerOfTwo(activeOutputY))
    : polynomial.ySize;
  if (addend.xSize > outputXSize || addend.ySize > outputYSize) {
    throw new Error("Fused linear benchmark addend must fit inside the output.");
  }

  const ranges = splitRanges(activeOutputX, taskCount);
  const inputRowBytes = polynomial.ySize * runtime.field.byteLength;
  const addendRowBytes = addend.ySize * runtime.field.byteLength;
  const results = await Promise.all(ranges.map(({ start, count }) => {
    const sourceStart = Math.max(0, start - (axis === "x" ? 1 : 0));
    const sourceEnd = Math.min(activeX, start + count);
    const addendStart = Math.min(start, addend.xSize);
    const addendEnd = Math.min(start + count, addend.xSize);
    return rawField.tm.queueAction(buildFusedLinearTask(
      polynomial.coefficients.slice(sourceStart * inputRowBytes, sourceEnd * inputRowBytes),
      sourceStart,
      polynomial.ySize,
      addend.coefficients.slice(addendStart * addendRowBytes, addendEnd * addendRowBytes),
      addendStart,
      addendEnd - addendStart,
      addend.ySize,
      start,
      count,
      activeX,
      activeY,
      activeOutputY,
      axis === "x" ? FUSED_LINEAR_X : FUSED_LINEAR_Y,
      coefficients,
      addendScale,
      runtime.field.byteLength,
    ));
  }));
  const output = new Uint8Array(outputXSize * outputYSize * runtime.field.byteLength);
  for (let index = 0; index < ranges.length; index += 1) {
    const shard = requireOutputs(results[index], 1, `fused-linear-${axis}`)[0];
    const { start, count } = ranges[index];
    for (let localX = 0; localX < count; localX += 1) {
      const sourceOffset = localX * activeOutputY * runtime.field.byteLength;
      output.set(
        shard.subarray(sourceOffset, sourceOffset + activeOutputY * runtime.field.byteLength),
        (start + localX) * outputYSize * runtime.field.byteLength,
      );
    }
  }
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
  buildSpecialKernel(module as unknown as ModuleBuilder, SPECIAL_X_MINUS_ONE, "x-minus-one");
  buildSpecialKernel(module as unknown as ModuleBuilder, SPECIAL_ONE_MINUS_X, "one-minus-x");
  buildSpecialKernel(module as unknown as ModuleBuilder, SPECIAL_LINEAR_X, "linear-x");
  buildSpecialKernel(module as unknown as ModuleBuilder, SPECIAL_LINEAR_Y, "linear-y");
  buildSpecialKernel(module as unknown as ModuleBuilder, SPECIAL_TERM9, "term9");
  buildFusedLinearKernel(module as unknown as ModuleBuilder, FUSED_LINEAR_X, "x");
  buildFusedLinearKernel(module as unknown as ModuleBuilder, FUSED_LINEAR_Y, "y");
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

function buildSpecialKernel(
  module: ModuleBuilder,
  functionName: string,
  operation: SpecialOperation,
): void {
  const fn = module.addFunction(functionName);
  fn.addParam("pInput", "i32");
  fn.addParam("sourceStart", "i32");
  fn.addParam("inputY", "i32");
  fn.addParam("outputStart", "i32");
  fn.addParam("xRows", "i32");
  fn.addParam("activeX", "i32");
  fn.addParam("activeY", "i32");
  fn.addParam("activeOutputY", "i32");
  fn.addParam("pConstant", "i32");
  fn.addParam("pX", "i32");
  fn.addParam("pY", "i32");
  fn.addParam("pOutput", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  fn.addLocal("globalX", "i32");
  const code = fn.getCodeBuilder();
  const value = code.i32_const(module.alloc(32));
  const current = code.i32_const(module.alloc(32));
  const shifted = code.i32_const(module.alloc(32));
  const term = code.i32_const(module.alloc(32));
  const sequence = (...parts: unknown[]): unknown =>
    (parts as readonly (readonly unknown[])[]).flat();
  const currentPointer = () =>
    specialInputPointer(code, code.getLocal("globalX"), code.getLocal("y"));
  const previousXPointer = () =>
    specialInputPointer(
      code,
      code.i32_sub(code.getLocal("globalX"), code.i32_const(1)),
      code.getLocal("y"),
    );
  const previousYPointer = () =>
    specialInputPointer(
      code,
      code.getLocal("globalX"),
      code.i32_sub(code.getLocal("y"), code.i32_const(1)),
    );
  const ifCurrent = (body: unknown) =>
    code.if(
      code.i32_lt_u(code.getLocal("globalX"), code.getLocal("activeX")),
      code.if(code.i32_lt_u(code.getLocal("y"), code.getLocal("activeY")), body),
    );
  const ifPreviousX = (body: unknown) =>
    code.if(
      code.i32_gt_u(code.getLocal("globalX"), code.i32_const(0)),
      code.if(
        code.i32_lt_u(
          code.i32_sub(code.getLocal("globalX"), code.i32_const(1)),
          code.getLocal("activeX"),
        ),
        code.if(code.i32_lt_u(code.getLocal("y"), code.getLocal("activeY")), body),
      ),
    );
  const ifPreviousY = (body: unknown) =>
    code.if(
      code.i32_lt_u(code.getLocal("globalX"), code.getLocal("activeX")),
      code.if(
        code.i32_gt_u(code.getLocal("y"), code.i32_const(0)),
        code.if(
          code.i32_lt_u(
            code.i32_sub(code.getLocal("y"), code.i32_const(1)),
            code.getLocal("activeY"),
          ),
          body,
        ),
      ),
    );
  const addScaled = (pointer: unknown, factor: string): unknown =>
    sequence(
      code.call("frm_mul", pointer, code.getLocal(factor), term),
      code.call("frm_add", value, term, value),
    );

  const coefficientCode = operation === "x-minus-one" || operation === "one-minus-x"
    ? sequence(
        code.call("frm_zero", current),
        code.call("frm_zero", shifted),
        ifCurrent(code.call("frm_copy", currentPointer(), current)),
        ifPreviousX(code.call("frm_copy", previousXPointer(), shifted)),
        operation === "x-minus-one"
          ? code.call("frm_sub", shifted, current, value)
          : code.call("frm_sub", current, shifted, value),
      )
    : sequence(
        code.call("frm_zero", value),
        ifCurrent(addScaled(currentPointer(), "pConstant")),
        operation === "linear-x" || operation === "term9"
          ? ifPreviousX(addScaled(previousXPointer(), "pX"))
          : [],
        operation === "linear-y" || operation === "term9"
          ? ifPreviousY(addScaled(previousYPointer(), "pY"))
          : [],
      );

  fn.addCode(
    code.setLocal("x", code.i32_const(0)),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("xRows"))),
      code.setLocal(
        "globalX",
        code.i32_add(code.getLocal("outputStart"), code.getLocal("x")),
      ),
      code.setLocal("y", code.i32_const(0)),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("activeOutputY"))),
        coefficientCode,
        code.call("frm_copy", value, specialOutputPointer(code)),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
      code.br(0),
    )),
  );
  module.exportFunction(functionName);
}

function buildFusedLinearKernel(
  module: ModuleBuilder,
  functionName: string,
  axis: "x" | "y",
): void {
  const fn = module.addFunction(functionName);
  fn.addParam("pInput", "i32");
  fn.addParam("sourceStart", "i32");
  fn.addParam("inputY", "i32");
  fn.addParam("pAddend", "i32");
  fn.addParam("addendStart", "i32");
  fn.addParam("addendRows", "i32");
  fn.addParam("addendY", "i32");
  fn.addParam("outputStart", "i32");
  fn.addParam("xRows", "i32");
  fn.addParam("activeX", "i32");
  fn.addParam("activeY", "i32");
  fn.addParam("activeOutputY", "i32");
  fn.addParam("pConstant", "i32");
  fn.addParam("pShift", "i32");
  fn.addParam("pAddendScale", "i32");
  fn.addParam("pOutput", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  fn.addLocal("globalX", "i32");
  const code = fn.getCodeBuilder();
  const value = code.i32_const(module.alloc(32));
  const term = code.i32_const(module.alloc(32));
  const sequence = (...parts: unknown[]): unknown =>
    (parts as readonly (readonly unknown[])[]).flat();
  const addScaled = (pointer: unknown, factor: string): unknown =>
    sequence(
      code.call("frm_mul", pointer, code.getLocal(factor), term),
      code.call("frm_add", value, term, value),
    );
  const current = specialInputPointer(code, code.getLocal("globalX"), code.getLocal("y"));
  const shifted = axis === "x"
    ? specialInputPointer(
        code,
        code.i32_sub(code.getLocal("globalX"), code.i32_const(1)),
        code.getLocal("y"),
      )
    : specialInputPointer(
        code,
        code.getLocal("globalX"),
        code.i32_sub(code.getLocal("y"), code.i32_const(1)),
      );

  fn.addCode(
    code.setLocal("x", code.i32_const(0)),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("xRows"))),
      code.setLocal(
        "globalX",
        code.i32_add(code.getLocal("outputStart"), code.getLocal("x")),
      ),
      code.setLocal("y", code.i32_const(0)),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("activeOutputY"))),
        code.call("frm_zero", value),
        code.if(
          code.i32_lt_u(code.getLocal("globalX"), code.getLocal("activeX")),
          code.if(
            code.i32_lt_u(code.getLocal("y"), code.getLocal("activeY")),
            addScaled(current, "pConstant"),
          ),
        ),
        axis === "x"
          ? code.if(
              code.i32_gt_u(code.getLocal("globalX"), code.i32_const(0)),
              code.if(
                code.i32_lt_u(
                  code.i32_sub(code.getLocal("globalX"), code.i32_const(1)),
                  code.getLocal("activeX"),
                ),
                code.if(
                  code.i32_lt_u(code.getLocal("y"), code.getLocal("activeY")),
                  addScaled(shifted, "pShift"),
                ),
              ),
            )
          : code.if(
              code.i32_lt_u(code.getLocal("globalX"), code.getLocal("activeX")),
              code.if(
                code.i32_gt_u(code.getLocal("y"), code.i32_const(0)),
                code.if(
                  code.i32_lt_u(
                    code.i32_sub(code.getLocal("y"), code.i32_const(1)),
                    code.getLocal("activeY"),
                  ),
                  addScaled(shifted, "pShift"),
                ),
              ),
            ),
        code.if(
          code.i32_ge_u(code.getLocal("globalX"), code.getLocal("addendStart")),
          code.if(
            code.i32_lt_u(
              code.getLocal("globalX"),
              code.i32_add(code.getLocal("addendStart"), code.getLocal("addendRows")),
            ),
            code.if(
              code.i32_lt_u(code.getLocal("y"), code.getLocal("addendY")),
              addScaled(fusedAddendPointer(code), "pAddendScale"),
            ),
          ),
        ),
        code.call("frm_copy", value, specialOutputPointer(code)),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
      code.br(0),
    )),
  );
  module.exportFunction(functionName);
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

function specialInputPointer(
  code: WasmCodeBuilder,
  globalX: unknown,
  y: unknown,
): unknown {
  return code.i32_add(
    code.getLocal("pInput"),
    code.i32_mul(
      code.i32_add(
        code.i32_mul(
          code.i32_sub(globalX, code.getLocal("sourceStart")),
          code.getLocal("inputY"),
        ),
        y,
      ),
      code.i32_const(32),
    ),
  );
}

function specialOutputPointer(code: WasmCodeBuilder): unknown {
  return code.i32_add(
    code.getLocal("pOutput"),
    code.i32_mul(
      code.i32_add(
        code.i32_mul(code.getLocal("x"), code.getLocal("activeOutputY")),
        code.getLocal("y"),
      ),
      code.i32_const(32),
    ),
  );
}

function fusedAddendPointer(code: WasmCodeBuilder): unknown {
  return code.i32_add(
    code.getLocal("pAddend"),
    code.i32_mul(
      code.i32_add(
        code.i32_mul(
          code.i32_sub(code.getLocal("globalX"), code.getLocal("addendStart")),
          code.getLocal("addendY"),
        ),
        code.getLocal("y"),
      ),
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

function buildSpecialTask(
  source: Uint8Array,
  sourceStart: number,
  _sourceRows: number,
  inputYSize: number,
  outputStart: number,
  outputXRows: number,
  activeX: number,
  activeY: number,
  activeOutputY: number,
  functionName: string,
  coefficients: SpecialCoefficients,
  elementBytes: number,
): FfWorkerCommand[] {
  const outputBytes = outputXRows * activeOutputY * elementBytes;
  return [
    { cmd: "ALLOCSET", var: 0, buff: source },
    { cmd: "ALLOCSET", var: 1, buff: coefficients.constant },
    { cmd: "ALLOCSET", var: 2, buff: coefficients.x },
    { cmd: "ALLOCSET", var: 3, buff: coefficients.y },
    { cmd: "ALLOC", var: 4, len: outputBytes },
    {
      cmd: "CALL",
      fnName: functionName,
      params: [
        { var: 0 },
        { val: sourceStart },
        { val: inputYSize },
        { val: outputStart },
        { val: outputXRows },
        { val: activeX },
        { val: activeY },
        { val: activeOutputY },
        { var: 1 },
        { var: 2 },
        { var: 3 },
        { var: 4 },
      ],
    },
    { cmd: "GET", out: 0, var: 4, len: outputBytes },
  ];
}

function buildFusedLinearTask(
  source: Uint8Array,
  sourceStart: number,
  inputYSize: number,
  addend: Uint8Array,
  addendStart: number,
  addendRows: number,
  addendYSize: number,
  outputStart: number,
  outputXRows: number,
  activeX: number,
  activeY: number,
  activeOutputY: number,
  functionName: string,
  coefficients: readonly [Uint8Array, Uint8Array],
  addendScale: Uint8Array,
  elementBytes: number,
): FfWorkerCommand[] {
  const outputBytes = outputXRows * activeOutputY * elementBytes;
  return [
    { cmd: "ALLOCSET", var: 0, buff: source },
    { cmd: "ALLOCSET", var: 1, buff: addend },
    { cmd: "ALLOCSET", var: 2, buff: coefficients[0] },
    { cmd: "ALLOCSET", var: 3, buff: coefficients[1] },
    { cmd: "ALLOCSET", var: 4, buff: addendScale },
    { cmd: "ALLOC", var: 5, len: outputBytes },
    {
      cmd: "CALL",
      fnName: functionName,
      params: [
        { var: 0 },
        { val: sourceStart },
        { val: inputYSize },
        { var: 1 },
        { val: addendStart },
        { val: addendRows },
        { val: addendYSize },
        { val: outputStart },
        { val: outputXRows },
        { val: activeX },
        { val: activeY },
        { val: activeOutputY },
        { var: 2 },
        { var: 3 },
        { var: 4 },
        { var: 5 },
      ],
    },
    { cmd: "GET", out: 0, var: 5, len: outputBytes },
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

function specialFunctionName(operation: SpecialOperation): string {
  switch (operation) {
    case "x-minus-one":
      return SPECIAL_X_MINUS_ONE;
    case "one-minus-x":
      return SPECIAL_ONE_MINUS_X;
    case "linear-x":
      return SPECIAL_LINEAR_X;
    case "linear-y":
      return SPECIAL_LINEAR_Y;
    case "term9":
      return SPECIAL_TERM9;
  }
}

function nextPowerOfTwo(value: number): number {
  let size = 1;
  while (size < value) {
    size *= 2;
  }
  return size;
}
