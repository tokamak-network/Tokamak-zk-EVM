import type { WasmModuleBuilder } from "./kernel-builder-types.js";
import { installRuffiniKernels, installVanishingKernels } from "./kernels/division-kernels.js";
import { installEvaluationKernels } from "./kernels/evaluation-kernels.js";
import { installBasicLinearKernels } from "./kernels/linear-kernels.js";
import { buildSparseRowDotKernel } from "./kernels/sparse-witness-kernels.js";
import { buildSelectionAccumulateKernel } from "./kernels/selection-kernel.js";
import { buildCopyOperandsKernel, buildOrderedRecurrenceKernel } from "./kernels/ordered-recurrence-kernel.js";
import { buildShortConvolutionKernel } from "./kernels/short-convolution-kernel.js";

export function installLinearBatchPlugin(module: WasmModuleBuilder): void {
  installBasicLinearKernels(module);
  installRuffiniKernels(module);
  installEvaluationKernels(module);
  installVanishingKernels(module);
  buildSparseRowDotKernel(module);
  buildSelectionAccumulateKernel(module);
  buildOrderedRecurrenceKernel(module);
  buildCopyOperandsKernel(module);
  buildShortConvolutionKernel(module);
}
