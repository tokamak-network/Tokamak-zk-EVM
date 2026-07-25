import { getCurveFromName } from "ffjavascript";

import type { FfField, FfWorkerCommand } from "../../../src/core/curve/curve.js";
import { createFieldRuntime, type FieldRuntime } from "../../../src/core/field/field.js";
import {
  installLinearBatchPlugin,
  type WasmModuleBuilder,
} from "../../../src/core/field/linear-batch-plugin.js";
import type { ProverPlacementVariables } from "../../../src/prover/internal/witness.js";
import type { ProverSparseMatrix } from "./legacy-sparse-r1cs.js";

const SPARSE_ROW_DOT = "tokamak_bench_sparseRowDot";

interface RawCurve {
  readonly Fr: FfField;
  terminate?(): Promise<void>;
}

interface WasmCodeBuilder {
  i32_const(value: number): unknown;
  getLocal(name: string): unknown;
  setLocal(name: string, value: unknown): unknown;
  i32_add(left: unknown, right: unknown): unknown;
  i32_mul(left: unknown, right: unknown): unknown;
  i32_eq(left: unknown, right: unknown): unknown;
  i32_ge_u(left: unknown, right: unknown): unknown;
  i32_load(pointer: unknown): unknown;
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

interface PackedSparseShard {
  readonly rowOffsets: Uint8Array;
  readonly columns: Uint8Array;
  readonly coefficients: Uint8Array;
  readonly variables: Uint8Array;
  readonly rowCount: number;
}

export interface SparseBenchmarkRuntimes {
  readonly field: FieldRuntime;
  readonly singleField: FfField;
  readonly multiField: FfField;
  readonly workerCount: number;
  terminate(): Promise<void>;
}

export async function createSparseBenchmarkRuntimes(): Promise<SparseBenchmarkRuntimes> {
  const loadCurve = getCurveFromName as unknown as (
    name: string,
    singleThread: boolean,
    plugin: (module: WasmModuleBuilder) => void,
  ) => Promise<RawCurve>;
  const single = await loadCurve("bls12381", true, installSparseBenchmarkPlugin);
  const multi = await loadCurve("bls12381", false, installSparseBenchmarkPlugin);

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

export async function evaluateSparseRowsCallerWasm(
  runtimes: SparseBenchmarkRuntimes,
  placement: ProverPlacementVariables,
  matrix: ProverSparseMatrix,
  rowCount: number,
): Promise<Uint8Array> {
  return evaluateSparseRows(runtimes, runtimes.singleField, placement, matrix, rowCount, 1);
}

export async function evaluateSparseRowsOneWorker(
  runtimes: SparseBenchmarkRuntimes,
  placement: ProverPlacementVariables,
  matrix: ProverSparseMatrix,
  rowCount: number,
): Promise<Uint8Array> {
  return evaluateSparseRows(runtimes, runtimes.multiField, placement, matrix, rowCount, 1);
}

export async function evaluateSparseRowsWorkers(
  runtimes: SparseBenchmarkRuntimes,
  placement: ProverPlacementVariables,
  matrix: ProverSparseMatrix,
  rowCount: number,
): Promise<Uint8Array> {
  return evaluateSparseRows(
    runtimes,
    runtimes.multiField,
    placement,
    matrix,
    rowCount,
    runtimes.workerCount,
  );
}

async function evaluateSparseRows(
  runtimes: SparseBenchmarkRuntimes,
  rawField: FfField,
  placement: ProverPlacementVariables,
  matrix: ProverSparseMatrix,
  rowCount: number,
  taskCount: number,
): Promise<Uint8Array> {
  const ranges = splitRanges(rowCount, taskCount);
  const tasks = ranges.map(({ start, count }) => {
    const packed = packSparseShard(
      runtimes.field,
      placement,
      matrix,
      start,
      count,
    );
    return rawField.tm.queueAction(buildSparseTask(packed, runtimes.field.byteLength));
  });
  const results = await Promise.all(tasks);
  const output = new Uint8Array(rowCount * runtimes.field.byteLength);

  for (let index = 0; index < ranges.length; index += 1) {
    const shard = requireOutput(results[index]);
    output.set(shard, ranges[index].start * runtimes.field.byteLength);
  }

  return output;
}

function packSparseShard(
  field: FieldRuntime,
  placement: ProverPlacementVariables,
  matrix: ProverSparseMatrix,
  rowStart: number,
  rowCount: number,
): PackedSparseShard {
  const variables = new Uint8Array(matrix.activeWires.length * field.byteLength);
  for (let index = 0; index < matrix.activeWires.length; index += 1) {
    const localIndex = matrix.activeWires[index];
    if (!Number.isSafeInteger(localIndex) || localIndex < 0 || localIndex >= placement.variables.length) {
      throw new Error(`Sparse R1CS active wire ${localIndex} is outside the placement variable range.`);
    }
    field.writeBufferElement(variables, index, placement.variables[localIndex]);
  }

  const rowOffsets = new Uint32Array(rowCount + 1);
  let entryCount = 0;
  for (let localRow = 0; localRow < rowCount; localRow += 1) {
    const row = matrix.sparseRows[rowStart + localRow] ?? [];
    entryCount += row.length;
    rowOffsets[localRow + 1] = entryCount;
  }

  const columns = new Uint32Array(entryCount);
  const coefficients = new Uint8Array(entryCount * field.byteLength);
  let entryIndex = 0;
  for (let localRow = 0; localRow < rowCount; localRow += 1) {
    const row = matrix.sparseRows[rowStart + localRow] ?? [];
    for (const entry of row) {
      if (!Number.isSafeInteger(entry.column) || entry.column < 0 || entry.column >= matrix.activeWires.length) {
        throw new Error(`Sparse R1CS column ${entry.column} is outside the active wire range.`);
      }
      columns[entryIndex] = entry.column;
      field.writeBufferElement(coefficients, entryIndex, entry.coefficient);
      entryIndex += 1;
    }
  }

  return {
    rowOffsets: uint32Bytes(rowOffsets),
    columns: uint32Bytes(columns),
    coefficients,
    variables,
    rowCount,
  };
}

function uint32Bytes(values: Uint32Array): Uint8Array {
  const output = new Uint8Array(values.length * 4);
  const view = new DataView(output.buffer);
  for (let index = 0; index < values.length; index += 1) {
    view.setUint32(index * 4, values[index], true);
  }
  return output;
}

function buildSparseTask(
  packed: PackedSparseShard,
  elementBytes: number,
): FfWorkerCommand[] {
  const outputBytes = packed.rowCount * elementBytes;
  return [
    { cmd: "ALLOCSET", var: 0, buff: packed.rowOffsets },
    { cmd: "ALLOCSET", var: 1, buff: packed.columns },
    { cmd: "ALLOCSET", var: 2, buff: packed.coefficients },
    { cmd: "ALLOCSET", var: 3, buff: packed.variables },
    { cmd: "ALLOC", var: 4, len: outputBytes },
    {
      cmd: "CALL",
      fnName: SPARSE_ROW_DOT,
      params: [
        { var: 0 },
        { var: 1 },
        { var: 2 },
        { var: 3 },
        { val: packed.rowCount },
        { var: 4 },
      ],
    },
    { cmd: "GET", out: 0, var: 4, len: outputBytes },
  ];
}

function requireOutput(outputs: readonly Uint8Array[]): Uint8Array {
  if (outputs.length !== 1) {
    throw new Error(`Sparse row-dot worker returned ${outputs.length} outputs; expected one.`);
  }
  return outputs[0];
}

function splitRanges(total: number, requested: number): { start: number; count: number }[] {
  const taskCount = Math.max(1, Math.min(total, requested));
  const ranges: { start: number; count: number }[] = [];
  for (let index = 0; index < taskCount; index += 1) {
    const start = Math.floor((total * index) / taskCount);
    const end = Math.floor((total * (index + 1)) / taskCount);
    ranges.push({ start, count: end - start });
  }
  return ranges;
}

function installSparseBenchmarkPlugin(module: WasmModuleBuilder): void {
  installLinearBatchPlugin(module);
  buildSparseRowDotKernel(module as unknown as ModuleBuilder);
}

function buildSparseRowDotKernel(module: ModuleBuilder): void {
  const fn = module.addFunction(SPARSE_ROW_DOT);
  fn.addParam("pRowOffsets", "i32");
  fn.addParam("pColumns", "i32");
  fn.addParam("pCoefficients", "i32");
  fn.addParam("pVariables", "i32");
  fn.addParam("rowCount", "i32");
  fn.addParam("pOutput", "i32");
  fn.addLocal("row", "i32");
  fn.addLocal("entry", "i32");
  fn.addLocal("end", "i32");
  fn.addLocal("column", "i32");
  const code = fn.getCodeBuilder();
  const accumulator = code.i32_const(module.alloc(32));
  const term = code.i32_const(module.alloc(32));

  fn.addCode(
    code.setLocal("row", code.i32_const(0)),
    code.block(code.loop(
      code.br_if(1, code.i32_eq(code.getLocal("row"), code.getLocal("rowCount"))),
      code.setLocal(
        "entry",
        code.i32_load(
          code.i32_add(
            code.getLocal("pRowOffsets"),
            code.i32_mul(code.getLocal("row"), code.i32_const(4)),
          ),
        ),
      ),
      code.setLocal(
        "end",
        code.i32_load(
          code.i32_add(
            code.getLocal("pRowOffsets"),
            code.i32_mul(
              code.i32_add(code.getLocal("row"), code.i32_const(1)),
              code.i32_const(4),
            ),
          ),
        ),
      ),
      code.call("frm_zero", accumulator),
      code.block(code.loop(
        code.br_if(1, code.i32_ge_u(code.getLocal("entry"), code.getLocal("end"))),
        code.setLocal(
          "column",
          code.i32_load(
            code.i32_add(
              code.getLocal("pColumns"),
              code.i32_mul(code.getLocal("entry"), code.i32_const(4)),
            ),
          ),
        ),
        code.call(
          "frm_mul",
          code.i32_add(
            code.getLocal("pCoefficients"),
            code.i32_mul(code.getLocal("entry"), code.i32_const(32)),
          ),
          code.i32_add(
            code.getLocal("pVariables"),
            code.i32_mul(code.getLocal("column"), code.i32_const(32)),
          ),
          term,
        ),
        code.call("frm_add", accumulator, term, accumulator),
        code.setLocal("entry", code.i32_add(code.getLocal("entry"), code.i32_const(1))),
        code.br(0),
      )),
      code.call(
        "frm_copy",
        accumulator,
        code.i32_add(
          code.getLocal("pOutput"),
          code.i32_mul(code.getLocal("row"), code.i32_const(32)),
        ),
      ),
      code.setLocal("row", code.i32_add(code.getLocal("row"), code.i32_const(1))),
      code.br(0),
    )),
  );
  module.exportFunction(SPARSE_ROW_DOT);
}
