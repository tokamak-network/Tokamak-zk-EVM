import { getCurveFromName } from "ffjavascript";

import {
  BivariatePolynomialBuffer,
  type BivariateBufferVanishingQuotientResult,
} from "../../../src/index.js";
import type { FfField, FfWorkerCommand } from "../../../src/core/curve/curve.js";
import { createFieldRuntime, type FieldRuntime } from "../../../src/core/field/field.js";
import {
  installLinearBatchPlugin,
  type WasmModuleBuilder,
} from "../../../src/core/field/linear-batch-plugin.js";

const VANISHING_Y = "tokamak_bench_vanishingY";
const VANISHING_X = "tokamak_bench_vanishingX";

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

export interface VanishingBenchmarkRuntimes {
  readonly field: FieldRuntime;
  readonly singleField: FfField;
  readonly multiField: FfField;
  readonly workerCount: number;
  terminate(): Promise<void>;
}

export async function createVanishingBenchmarkRuntimes(): Promise<VanishingBenchmarkRuntimes> {
  const loadCurve = getCurveFromName as unknown as (
    name: string,
    singleThread: boolean,
    plugin: (module: WasmModuleBuilder) => void,
  ) => Promise<RawCurve>;
  const single = await loadCurve("bls12381", true, installVanishingPlugin);
  const multi = await loadCurve("bls12381", false, installVanishingPlugin);
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

export async function divideVanishingWasmSingle(
  runtime: VanishingBenchmarkRuntimes,
  polynomial: BivariatePolynomialBuffer,
  xDegree: number,
  yDegree: number,
): Promise<BivariateBufferVanishingQuotientResult> {
  return divideVanishing(runtime, runtime.singleField, polynomial, xDegree, yDegree, 1);
}

export async function divideVanishingWasmWorkers(
  runtime: VanishingBenchmarkRuntimes,
  polynomial: BivariatePolynomialBuffer,
  xDegree: number,
  yDegree: number,
): Promise<BivariateBufferVanishingQuotientResult> {
  return divideVanishing(
    runtime,
    runtime.multiField,
    polynomial,
    xDegree,
    yDegree,
    runtime.workerCount,
  );
}

export async function divideVanishingWasmOneWorker(
  runtime: VanishingBenchmarkRuntimes,
  polynomial: BivariatePolynomialBuffer,
  xDegree: number,
  yDegree: number,
): Promise<BivariateBufferVanishingQuotientResult> {
  return divideVanishing(runtime, runtime.multiField, polynomial, xDegree, yDegree, 1);
}

async function divideVanishing(
  runtime: VanishingBenchmarkRuntimes,
  rawField: FfField,
  polynomial: BivariatePolynomialBuffer,
  xDegree: number,
  yDegree: number,
  taskCount: number,
): Promise<BivariateBufferVanishingQuotientResult> {
  const optimized = polynomial.optimizeSize();
  const { xDegree: numeratorXDegree, yDegree: numeratorYDegree } = optimized.findDegree();
  if (numeratorXDegree < xDegree || numeratorYDegree < yDegree) {
    throw new Error("Benchmark numerator degrees must cover both vanishing degrees.");
  }
  if (optimized.xSize % xDegree !== 0 || optimized.ySize % yDegree !== 0) {
    throw new Error("Benchmark numerator shape must be divisible by the vanishing degrees.");
  }
  const xRanges = splitRanges(xDegree, taskCount);
  const xBlockCount = optimized.xSize / xDegree;
  const yResults = await Promise.all(xRanges.map(({ start, count }) => {
    const input = extractXBlockRows(
      optimized.coefficients,
      optimized.xSize,
      optimized.ySize,
      xDegree,
      start,
      count,
      runtime.field.byteLength,
    );
    return rawField.tm.queueAction(
      buildVanishingYTask(
        input,
        xBlockCount,
        count,
        optimized.ySize,
        yDegree,
        runtime.field.byteLength,
      ),
    );
  }));
  const quotientY = new Uint8Array(xDegree * optimized.ySize * runtime.field.byteLength);
  const corrected = optimized.coefficients.slice();
  for (let index = 0; index < xRanges.length; index += 1) {
    const outputs = requireOutputs(yResults[index], 2, "Vanishing Y");
    const offset = xRanges[index].start * optimized.ySize * runtime.field.byteLength;
    quotientY.set(outputs[0], offset);
    corrected.set(outputs[1], offset);
  }

  const yRanges = splitRanges(optimized.ySize, taskCount);
  const xResults = await Promise.all(yRanges.map(({ start, count }) => {
    const input = extractColumns(
      corrected,
      optimized.xSize,
      optimized.ySize,
      start,
      count,
      runtime.field.byteLength,
    );
    return rawField.tm.queueAction(
      buildVanishingXTask(
        input,
        optimized.xSize,
        count,
        xDegree,
        runtime.field.byteLength,
      ),
    );
  }));
  const quotientX = assembleColumns(
    xResults.map((result) => requireOutputs(result, 1, "Vanishing X")[0]),
    yRanges,
    optimized.xSize,
    optimized.ySize,
    runtime.field.byteLength,
  );
  return {
    quotientX: BivariatePolynomialBuffer.fromOwnedBuffer(
      runtime.field,
      quotientX,
      optimized.xSize,
      optimized.ySize,
    ),
    quotientY: BivariatePolynomialBuffer.fromOwnedBuffer(
      runtime.field,
      quotientY,
      xDegree,
      optimized.ySize,
    ),
  };
}

export function vanishingTemporaryBytes(
  xSize: number,
  ySize: number,
  xDegree: number,
  elementBytes: number,
): number {
  const input = xSize * ySize * elementBytes;
  const quotientX = input;
  const quotientY = xDegree * ySize * elementBytes;
  return input * 3 + quotientX * 2 + quotientY * 3;
}

function installVanishingPlugin(module: WasmModuleBuilder): void {
  installLinearBatchPlugin(module);
  buildVanishingYKernel(module as unknown as ModuleBuilder);
  buildVanishingXKernel(module as unknown as ModuleBuilder);
}

function buildVanishingYKernel(module: ModuleBuilder): void {
  const fn = module.addFunction(VANISHING_Y);
  fn.addParam("pInput", "i32");
  fn.addParam("xBlockCount", "i32");
  fn.addParam("xRows", "i32");
  fn.addParam("ySize", "i32");
  fn.addParam("yDegree", "i32");
  fn.addParam("pAccumulated", "i32");
  fn.addParam("pQuotient", "i32");
  fn.addParam("pCorrected", "i32");
  fn.addLocal("block", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  const code = fn.getCodeBuilder();
  const zero = code.i32_const(module.alloc(32));
  fn.addCode(
    code.call("frm_zero", zero),
    code.setLocal("x", code.i32_const(0)),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("xRows"))),
      code.setLocal("y", code.i32_const(0)),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("ySize"))),
        code.call("frm_zero", xyPointer(code, "pAccumulated", "xRows")),
        code.setLocal("block", code.i32_const(0)),
        code.block(code.loop(
          code.br_if(1, code.i32_eq(code.getLocal("block"), code.getLocal("xBlockCount"))),
          code.call(
            "frm_add",
            xyPointer(code, "pAccumulated", "xRows"),
            blockXyPointer(code, "pInput"),
            xyPointer(code, "pAccumulated", "xRows"),
          ),
          code.setLocal("block", code.i32_add(code.getLocal("block"), code.i32_const(1))),
          code.br(0),
        )),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("block", code.i32_const(0)),
      code.setLocal("y", code.i32_const(0)),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("yDegree"))),
        code.call(
          "frm_sub",
          zero,
          xyPointer(code, "pAccumulated", "xRows"),
          xyPointer(code, "pQuotient", "xRows"),
        ),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("y", code.getLocal("yDegree")),
      code.block(code.loop(
        code.br_if(
          1,
          code.i32_eq(
            code.getLocal("y"),
            code.i32_sub(code.getLocal("ySize"), code.getLocal("yDegree")),
          ),
        ),
        code.call(
          "frm_sub",
          quotientPreviousYPointer(code, "pQuotient"),
          xyPointer(code, "pAccumulated", "xRows"),
          xyPointer(code, "pQuotient", "xRows"),
        ),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("y", code.i32_const(0)),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("ySize"))),
        code.call(
          "frm_copy",
          blockXyPointer(code, "pInput"),
          xyPointer(code, "pCorrected", "xRows"),
        ),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("y", code.i32_const(0)),
      code.block(code.loop(
        code.br_if(
          1,
          code.i32_eq(
            code.getLocal("y"),
            code.i32_sub(code.getLocal("ySize"), code.getLocal("yDegree")),
          ),
        ),
        code.call(
          "frm_add",
          xyPointer(code, "pCorrected", "xRows"),
          xyPointer(code, "pQuotient", "xRows"),
          xyPointer(code, "pCorrected", "xRows"),
        ),
        code.call(
          "frm_sub",
          correctedShiftedYPointer(code),
          xyPointer(code, "pQuotient", "xRows"),
          correctedShiftedYPointer(code),
        ),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
      code.br(0),
    )),
  );
  module.exportFunction(VANISHING_Y);
}

function buildVanishingXKernel(module: ModuleBuilder): void {
  const fn = module.addFunction(VANISHING_X);
  fn.addParam("pInput", "i32");
  fn.addParam("xSize", "i32");
  fn.addParam("yCols", "i32");
  fn.addParam("xDegree", "i32");
  fn.addParam("pQuotient", "i32");
  fn.addLocal("x", "i32");
  fn.addLocal("y", "i32");
  const code = fn.getCodeBuilder();
  const zero = code.i32_const(module.alloc(32));
  fn.addCode(
    code.call("frm_zero", zero),
    code.setLocal("x", code.i32_const(0)),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("x"), code.getLocal("xDegree"))),
      code.setLocal("y", code.i32_const(0)),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("yCols"))),
        code.call("frm_sub", zero, compactXyPointer(code, "pInput"), compactXyPointer(code, "pQuotient")),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
      code.br(0),
    )),
    code.setLocal("x", code.getLocal("xDegree")),
    code.block(code.loop(
      code.br_if(
        1,
        code.i32_eq(
          code.getLocal("x"),
          code.i32_sub(code.getLocal("xSize"), code.getLocal("xDegree")),
        ),
      ),
      code.setLocal("y", code.i32_const(0)),
      code.block(code.loop(
        code.br_if(1, code.i32_eq(code.getLocal("y"), code.getLocal("yCols"))),
        code.call(
          "frm_sub",
          quotientPreviousXPointer(code),
          compactXyPointer(code, "pInput"),
          compactXyPointer(code, "pQuotient"),
        ),
        code.setLocal("y", code.i32_add(code.getLocal("y"), code.i32_const(1))),
        code.br(0),
      )),
      code.setLocal("x", code.i32_add(code.getLocal("x"), code.i32_const(1))),
      code.br(0),
    )),
  );
  module.exportFunction(VANISHING_X);
}

function buildVanishingYTask(
  input: Uint8Array,
  xBlockCount: number,
  xRows: number,
  ySize: number,
  yDegree: number,
  elementBytes: number,
): FfWorkerCommand[] {
  const rowBytes = xRows * ySize * elementBytes;
  return [
    { cmd: "ALLOCSET", var: 0, buff: input },
    { cmd: "ALLOC", var: 1, len: rowBytes },
    { cmd: "ALLOCSET", var: 2, buff: new Uint8Array(rowBytes) },
    { cmd: "ALLOC", var: 3, len: rowBytes },
    {
      cmd: "CALL",
      fnName: VANISHING_Y,
      params: [
        { var: 0 },
        { val: xBlockCount },
        { val: xRows },
        { val: ySize },
        { val: yDegree },
        { var: 1 },
        { var: 2 },
        { var: 3 },
      ],
    },
    { cmd: "GET", out: 0, var: 2, len: rowBytes },
    { cmd: "GET", out: 1, var: 3, len: rowBytes },
  ];
}

function buildVanishingXTask(
  input: Uint8Array,
  xSize: number,
  yCols: number,
  xDegree: number,
  elementBytes: number,
): FfWorkerCommand[] {
  return [
    { cmd: "ALLOCSET", var: 0, buff: input },
    { cmd: "ALLOCSET", var: 1, buff: new Uint8Array(input.byteLength) },
    {
      cmd: "CALL",
      fnName: VANISHING_X,
      params: [{ var: 0 }, { val: xSize }, { val: yCols }, { val: xDegree }, { var: 1 }],
    },
    { cmd: "GET", out: 0, var: 1, len: input.byteLength },
  ];
}

function extractXBlockRows(
  source: Uint8Array,
  xSize: number,
  ySize: number,
  xDegree: number,
  localStart: number,
  localCount: number,
  elementBytes: number,
): Uint8Array {
  const blockCount = xSize / xDegree;
  const rowBytes = ySize * elementBytes;
  const output = new Uint8Array(blockCount * localCount * rowBytes);
  for (let block = 0; block < blockCount; block += 1) {
    const sourceStart = (block * xDegree + localStart) * rowBytes;
    output.set(
      source.subarray(sourceStart, sourceStart + localCount * rowBytes),
      block * localCount * rowBytes,
    );
  }
  return output;
}

function extractColumns(
  source: Uint8Array,
  xSize: number,
  ySize: number,
  start: number,
  count: number,
  elementBytes: number,
): Uint8Array {
  const output = new Uint8Array(xSize * count * elementBytes);
  for (let x = 0; x < xSize; x += 1) {
    output.set(
      source.subarray((x * ySize + start) * elementBytes, (x * ySize + start + count) * elementBytes),
      x * count * elementBytes,
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
    for (let x = 0; x < xSize; x += 1) {
      output.set(
        shards[shardIndex].subarray(x * count * elementBytes, (x + 1) * count * elementBytes),
        (x * ySize + start) * elementBytes,
      );
    }
  }
  return output;
}

function xyPointer(code: WasmCodeBuilder, base: string, _xRows: string): unknown {
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

function blockXyPointer(code: WasmCodeBuilder, base: string): unknown {
  return code.i32_add(
    code.getLocal(base),
    code.i32_mul(
      code.i32_add(
        code.i32_mul(
          code.i32_add(
            code.i32_mul(code.getLocal("block"), code.getLocal("xRows")),
            code.getLocal("x"),
          ),
          code.getLocal("ySize"),
        ),
        code.getLocal("y"),
      ),
      code.i32_const(32),
    ),
  );
}

function quotientPreviousYPointer(code: WasmCodeBuilder, base: string): unknown {
  return code.i32_add(
    code.getLocal(base),
    code.i32_mul(
      code.i32_add(
        code.i32_mul(code.getLocal("x"), code.getLocal("ySize")),
        code.i32_sub(code.getLocal("y"), code.getLocal("yDegree")),
      ),
      code.i32_const(32),
    ),
  );
}

function correctedShiftedYPointer(code: WasmCodeBuilder): unknown {
  return code.i32_add(
    code.getLocal("pCorrected"),
    code.i32_mul(
      code.i32_add(
        code.i32_mul(code.getLocal("x"), code.getLocal("ySize")),
        code.i32_add(code.getLocal("y"), code.getLocal("yDegree")),
      ),
      code.i32_const(32),
    ),
  );
}

function compactXyPointer(code: WasmCodeBuilder, base: string): unknown {
  return code.i32_add(
    code.getLocal(base),
    code.i32_mul(
      code.i32_add(
        code.i32_mul(code.getLocal("x"), code.getLocal("yCols")),
        code.getLocal("y"),
      ),
      code.i32_const(32),
    ),
  );
}

function quotientPreviousXPointer(code: WasmCodeBuilder): unknown {
  return code.i32_add(
    code.getLocal("pQuotient"),
    code.i32_mul(
      code.i32_add(
        code.i32_mul(
          code.i32_sub(code.getLocal("x"), code.getLocal("xDegree")),
          code.getLocal("yCols"),
        ),
        code.getLocal("y"),
      ),
      code.i32_const(32),
    ),
  );
}

function splitRanges(total: number, requested: number): { start: number; count: number }[] {
  const count = Math.min(total, Math.max(1, requested));
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((total * index) / count);
    const end = Math.floor((total * (index + 1)) / count);
    return { start, count: end - start };
  });
}

function requireOutputs(
  result: readonly Uint8Array[],
  expected: number,
  label: string,
): readonly Uint8Array[] {
  if (result.length !== expected) {
    throw new Error(`${label} returned ${result.length} outputs; expected ${expected}.`);
  }
  return result;
}
