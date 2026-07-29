import { BackendWasmError } from "../../backend-wasm-error.js";
import {
  NATIVE_BACKEND_VERSION,
  SUBCIRCUIT_LIBRARY_PACKAGE_VERSION,
} from "../../prover/generated/subcircuit-library.generated.js";
import { createCurveRuntime, type CurveRuntime } from "../../runtime/curve/curve.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../version.js";
import {
  loadPreprocessInputFromBinaryInput,
  type PreprocessBinaryInput,
} from "./binary-input.js";
import { preprocessSnark } from "../protocol/preprocess-snark.js";

const DEFAULT_CHUNK_SIZE_EXPONENT = 17;
const MIN_CHUNK_SIZE_EXPONENT = 10;
const MAX_CHUNK_SIZE_EXPONENT = 19;

export interface PreprocessInstallOptions {
  readonly chunkSizeExponent?: number;
}

export interface PreprocessInstallationInfo {
  readonly packageVersion: string;
  readonly nativeBackendVersion: string;
  readonly subcircuitLibraryVersion: string;
  readonly chunkSizeExponent: number;
  readonly chunkSize: number;
}

export type PreprocessInput = PreprocessBinaryInput;

let runtime: CurveRuntime | undefined;
let installationPromise: Promise<CurveRuntime> | undefined;
let busy = false;
let chunkSizeExponent = DEFAULT_CHUNK_SIZE_EXPONENT;

export async function install(
  options: PreprocessInstallOptions = {},
): Promise<PreprocessInstallationInfo> {
  const requestedExponent = parseInstallOptions(options);
  const installedRuntime = await requireInstalledRuntime();
  runtime = installedRuntime;

  if (requestedExponent !== undefined && requestedExponent !== chunkSizeExponent) {
    if (busy) {
      throw new BackendWasmError(
        "BUSY",
        "The preprocess chunk size cannot be changed while preprocess is running.",
      );
    }
    chunkSizeExponent = requestedExponent;
  }

  return installationInfo();
}

export async function preprocess(input: PreprocessInput): Promise<Uint8Array> {
  const installedRuntime = runtime;
  if (installedRuntime === undefined) {
    throw new BackendWasmError(
      "INSTALL_REQUIRED",
      "Call preprocess.install() successfully before preprocess().",
    );
  }
  if (busy) {
    throw new BackendWasmError("BUSY", "Preprocess is already running.");
  }

  assertPreprocessInput(input);
  busy = true;

  try {
    let runtimeInput;
    try {
      runtimeInput = await loadPreprocessInputFromBinaryInput(installedRuntime, input);
    } catch (cause) {
      throw new BackendWasmError(
        "INVALID_INPUT",
        "The preprocess input binaries could not be decoded.",
        { cause },
      );
    }

    try {
      return await preprocessSnark(installedRuntime, runtimeInput, {
        denseMsmChunkPoints: 2 ** chunkSizeExponent,
      });
    } catch (cause) {
      throw new BackendWasmError("RUNTIME_FAILED", "The preprocess runtime failed.", {
        cause,
      });
    }
  } finally {
    busy = false;
  }
}

async function requireInstalledRuntime(): Promise<CurveRuntime> {
  if (runtime !== undefined) {
    return runtime;
  }
  if (installationPromise !== undefined) {
    return installationPromise;
  }

  const pending = createCurveRuntime().catch((cause: unknown) => {
    throw new BackendWasmError(
      "INSTALL_FAILED",
      "The preprocess runtime could not be installed.",
      { cause },
    );
  });
  installationPromise = pending;

  try {
    return await pending;
  } catch (error) {
    if (installationPromise === pending) {
      installationPromise = undefined;
    }
    throw error;
  }
}

function parseInstallOptions(options: PreprocessInstallOptions): number | undefined {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new BackendWasmError(
      "INVALID_OPTION",
      "Preprocess install options must be an object.",
    );
  }

  const unsupported = Object.keys(options).filter((key) => key !== "chunkSizeExponent");
  if (unsupported.length > 0) {
    throw new BackendWasmError(
      "INVALID_OPTION",
      `Unsupported preprocess install option: ${unsupported.join(", ")}.`,
    );
  }

  const exponent = options.chunkSizeExponent;
  if (exponent === undefined) {
    return undefined;
  }
  if (
    !Number.isInteger(exponent)
    || exponent < MIN_CHUNK_SIZE_EXPONENT
    || exponent > MAX_CHUNK_SIZE_EXPONENT
  ) {
    throw new BackendWasmError(
      "INVALID_OPTION",
      `chunkSizeExponent must be an integer from ${MIN_CHUNK_SIZE_EXPONENT} through ${MAX_CHUNK_SIZE_EXPONENT}.`,
    );
  }
  return exponent;
}

function assertPreprocessInput(input: PreprocessInput): void {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new BackendWasmError("INVALID_INPUT", "Preprocess input must be an object.");
  }

  assertBinary(input.permutation, "permutation");
  assertBinary(input.instance, "instance");
  assertBinary(input.preprocessCrs, "preprocessCrs");
}

function assertBinary(value: Uint8Array, name: keyof PreprocessInput): void {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) {
    throw new BackendWasmError(
      "INVALID_INPUT",
      `Preprocess input '${name}' must be a non-empty Uint8Array.`,
    );
  }
}

function installationInfo(): PreprocessInstallationInfo {
  return {
    packageVersion: BACKEND_WASM_PACKAGE_VERSION,
    nativeBackendVersion: NATIVE_BACKEND_VERSION,
    subcircuitLibraryVersion: SUBCIRCUIT_LIBRARY_PACKAGE_VERSION,
    chunkSizeExponent,
    chunkSize: 2 ** chunkSizeExponent,
  };
}
