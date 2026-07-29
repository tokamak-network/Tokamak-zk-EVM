import { BackendWasmError } from "../../backend-wasm-error.js";
import {
  assertNamedBinaryInput,
  installCurveRuntime,
  parseChunkSizeExponent,
} from "../../api/public-api-utils.js";
import {
  NATIVE_BACKEND_VERSION,
  SUBCIRCUIT_LIBRARY_PACKAGE_VERSION,
} from "../../generated/setup.generated.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../version.js";
import {
  loadPreprocessInputFromBinaryInput,
  type PreprocessBinaryInput,
} from "./binary-input.js";
import { preprocessSnark } from "../protocol/preprocess-snark.js";

const DEFAULT_CHUNK_SIZE_EXPONENT = 17;

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
  const requestedExponent = parseChunkSizeExponent(options, "Preprocess");
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

  assertNamedBinaryInput(input, "Preprocess", ["permutation", "instance", "preprocessCrs"]);
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

  const pending = installCurveRuntime("The preprocess runtime could not be installed.");
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

function installationInfo(): PreprocessInstallationInfo {
  return {
    packageVersion: BACKEND_WASM_PACKAGE_VERSION,
    nativeBackendVersion: NATIVE_BACKEND_VERSION,
    subcircuitLibraryVersion: SUBCIRCUIT_LIBRARY_PACKAGE_VERSION,
    chunkSizeExponent,
    chunkSize: 2 ** chunkSizeExponent,
  };
}
