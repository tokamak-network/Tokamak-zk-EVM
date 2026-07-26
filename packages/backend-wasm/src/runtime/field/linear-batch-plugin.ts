import type { WasmModuleBuilder } from "./kernel-builder-types.js";
import { installRuffiniKernels, installVanishingKernels } from "./kernels/division-kernels.js";
import { installEvaluationKernels } from "./kernels/evaluation-kernels.js";
import { installBasicLinearKernels, installSpecialLinearKernels } from "./kernels/linear-kernels.js";
import { installRecurrenceKernels } from "./kernels/recurrence-kernels.js";
import { buildSparseRowDotKernel } from "./kernels/sparse-witness-kernels.js";

export function installLinearBatchPlugin(module: WasmModuleBuilder): void {
  installBasicLinearKernels(module);
  installRuffiniKernels(module);
  installEvaluationKernels(module);
  installVanishingKernels(module);
  installRecurrenceKernels(module);
  installSpecialLinearKernels(module);
  buildSparseRowDotKernel(module);
}
