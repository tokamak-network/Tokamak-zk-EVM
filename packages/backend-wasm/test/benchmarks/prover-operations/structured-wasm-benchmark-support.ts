import { getCurveFromName } from "ffjavascript";

import type { FfField } from "../../../src/core/curve/curve.js";
import { createFieldRuntime, type FieldRuntime } from "../../../src/core/field/field.js";
import {
  installLinearBatchPlugin,
  type WasmModuleBuilder,
} from "../../../src/core/field/linear-batch-plugin.js";

interface RawCurve {
  readonly Fr: FfField;
  terminate?(): Promise<void>;
}

export interface StructuredBenchmarkRuntimes {
  readonly field: FieldRuntime;
  readonly workerCount: number;
  terminate(): Promise<void>;
}

export async function createStructuredBenchmarkRuntimes(): Promise<StructuredBenchmarkRuntimes> {
  const loadCurve = getCurveFromName as unknown as (
    name: string,
    singleThread: boolean,
    plugin: (module: WasmModuleBuilder) => void,
  ) => Promise<RawCurve>;
  const curve = await loadCurve("bls12381", false, installLinearBatchPlugin);
  return {
    field: createFieldRuntime(curve.Fr),
    workerCount: curve.Fr.tm.concurrency,
    async terminate() {
      await curve.terminate?.();
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
