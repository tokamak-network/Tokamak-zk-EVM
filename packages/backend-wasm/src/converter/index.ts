import { BackendWasmError } from "../backend-wasm-error.js";
import { inspectBinary as inspectBinaryInternal } from "./conversion/binary-inspection.js";
import { convertInstance as convertInstanceInternal } from "./conversion/instance-converter.js";
import { convertPermutation as convertPermutationInternal } from "./conversion/permutation-converter.js";
import { convertProof as convertProofInternal } from "./conversion/proof-converter.js";
import { convertProverCrs as convertProverCrsInternal } from "./conversion/prover-crs-converter.js";
import { convertVerifierPreprocess as convertVerifierPreprocessInternal } from "./conversion/verifier-preprocess-converter.js";
import { convertWitness as convertWitnessInternal } from "./conversion/witness-converter.js";
import { validateBinary as validateBinaryInternal } from "./validation/validators.js";
import type { RuntimeArtifactFileValidationResult } from "./validation/validators.js";
import type {
  BinaryArtifactInspection,
  BinaryInspectionOptions,
  ConverterArtifactJson,
  ConvertProofBinaryInput,
  ConvertProofInput,
  ConvertProofJsonInput,
} from "./conversion/types.js";

export { BackendWasmError } from "../backend-wasm-error.js";
export type { BackendWasmErrorCode } from "../backend-wasm-error.js";

export function convertProof(input: ConvertProofJsonInput): Promise<Uint8Array>;
export function convertProof(input: ConvertProofBinaryInput): Promise<ConverterArtifactJson>;
export async function convertProof(
  input: ConvertProofInput,
): Promise<Uint8Array | ConverterArtifactJson> {
  if (
    typeof input !== "object"
    || input === null
    || !("sourceFormat" in input)
    || (input.sourceFormat !== "json" && input.sourceFormat !== "binary")
  ) {
    throw new BackendWasmError(
      "INVALID_OPTION",
      "convertProof sourceFormat must be 'json' or 'binary'.",
    );
  }

  return runConverter("convertProof", () => convertProofInternal(input));
}

export function convertVerifierPreprocess(preprocess: unknown): Promise<Uint8Array> {
  return runConverter(
    "convertVerifierPreprocess",
    () => convertVerifierPreprocessInternal(preprocess),
  );
}

export function convertInstance(instance: unknown): Promise<Uint8Array> {
  return runConverter("convertInstance", () => convertInstanceInternal(instance));
}

export function convertWitness(witness: unknown): Promise<Uint8Array> {
  return runConverter("convertWitness", () => convertWitnessInternal(witness));
}

export function convertProverCrs(rkyvBytes: Uint8Array): Promise<Uint8Array> {
  return runConverter("convertProverCrs", () => convertProverCrsInternal(rkyvBytes));
}

export function convertPermutation(permutation: unknown): Promise<Uint8Array> {
  return runConverter("convertPermutation", () => convertPermutationInternal(permutation));
}

export function inspectBinary(
  artifact: Uint8Array,
  options: BinaryInspectionOptions = {},
): Promise<BinaryArtifactInspection> {
  return runConverter("inspectBinary", () => inspectBinaryInternal(artifact, options));
}

export function validateBinary(
  artifact: Uint8Array,
): Promise<RuntimeArtifactFileValidationResult> {
  return runConverter("validateBinary", () => validateBinaryInternal(artifact));
}

async function runConverter<T>(
  operation: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    if (cause instanceof BackendWasmError) {
      throw cause;
    }
    throw new BackendWasmError(
      "INVALID_INPUT",
      `${operation} could not process its input.`,
      { cause },
    );
  }
}

export type { RuntimeArtifactFileValidationResult };

export type {
  BinaryArtifactInspection,
  BinaryInspectionOptions,
  BinarySectionInspection,
  ConverterArtifactJson,
  ConvertProofBinaryInput,
  ConvertProofInput,
  ConvertProofJsonInput,
} from "./conversion/types.js";
