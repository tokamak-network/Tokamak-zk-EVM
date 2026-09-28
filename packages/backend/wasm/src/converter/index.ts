import { BackendWasmError } from "../backend-wasm-error.js";
import { inspectBinary as inspectBinaryInternal } from "./conversion/binary-inspection.js";
import { convertInstance as convertInstanceInternal } from "./conversion/instance-converter.js";
import { convertPermutation as convertPermutationInternal } from "./conversion/permutation-converter.js";
import { convertSelector as convertSelectorInternal } from "./conversion/selector-converter.js";
import { convertWitness as convertWitnessInternal } from "./conversion/witness-converter.js";
import type { BinaryArtifactInspection } from "./conversion/types.js";
import { validateBinary as validateBinaryInternal, type RuntimeArtifactFileValidationResult } from "./validation/validators.js";

export { BackendWasmError } from "../backend-wasm-error.js";
export type { BackendWasmErrorCode } from "../backend-wasm-error.js";

export function convertInstance(instance: unknown): Promise<Uint8Array> {
  return runConverter("convertInstance", () => convertInstanceInternal(instance));
}

export function convertWitness(witness: unknown): Promise<Uint8Array> {
  return runConverter("convertWitness", () => convertWitnessInternal(witness));
}

export function convertPermutation(permutation: unknown): Promise<Uint8Array> {
  return runConverter("convertPermutation", () => convertPermutationInternal(permutation));
}

export function convertSelector(selector: unknown): Promise<Uint8Array> {
  return runConverter("convertSelector", () => convertSelectorInternal(selector));
}

export function inspectBinary(artifact: Uint8Array): Promise<BinaryArtifactInspection> {
  return runConverter("inspectBinary", () => inspectBinaryInternal(artifact));
}

export function validateBinary(artifact: Uint8Array): Promise<RuntimeArtifactFileValidationResult> {
  return runConverter("validateBinary", () => validateBinaryInternal(artifact));
}

async function runConverter<T>(operation: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    if (cause instanceof BackendWasmError) throw cause;
    throw new BackendWasmError("INVALID_INPUT", `${operation} could not process its input.`, { cause });
  }
}

export type { RuntimeArtifactFileValidationResult };
export type { BinaryArtifactInspection, BinarySectionInspection } from "./conversion/types.js";
