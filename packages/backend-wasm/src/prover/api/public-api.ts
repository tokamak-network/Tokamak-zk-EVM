import { BackendWasmError } from "../../backend-wasm-error.js";
import { createCurveRuntime, type CurveRuntime } from "../../runtime/curve/curve.js";
import {
  loadProverInputFromBinaryInput,
  type ProverBinaryInput,
} from "./binary-input.js";
import { proveSnark } from "./prove-snark.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../version.js";
import {
  NATIVE_BACKEND_VERSION,
  SUBCIRCUIT_LIBRARY_PACKAGE_VERSION,
} from "../generated/subcircuit-library.generated.js";

const DEFAULT_CHUNK_SIZE_EXPONENT = 18;
const MIN_CHUNK_SIZE_EXPONENT = 10;
const MAX_CHUNK_SIZE_EXPONENT = 19;

export interface ProverInstallOptions {
  readonly chunkSizeExponent?: number;
}

export interface ProverInstallationInfo {
  readonly packageVersion: string;
  readonly nativeBackendVersion: string;
  readonly subcircuitLibraryVersion: string;
  readonly chunkSizeExponent: number;
  readonly chunkSize: number;
}

export type ProverInput = ProverBinaryInput;

let runtime: CurveRuntime | undefined;
let installationPromise: Promise<CurveRuntime> | undefined;
let busy = false;
let chunkSizeExponent = DEFAULT_CHUNK_SIZE_EXPONENT;

export async function install(options: ProverInstallOptions = {}): Promise<ProverInstallationInfo> {
  const requestedExponent = parseInstallOptions(options);
  const installedRuntime = await requireInstalledRuntime();
  runtime = installedRuntime;

  if (requestedExponent !== undefined && requestedExponent !== chunkSizeExponent) {
    if (busy) {
      throw new BackendWasmError(
        "BUSY",
        "The prover chunk size cannot be changed while a proof is running.",
      );
    }
    chunkSizeExponent = requestedExponent;
  }

  return installationInfo();
}

export async function prove(input: ProverInput): Promise<Uint8Array> {
  const installedRuntime = runtime;
  if (installedRuntime === undefined) {
    throw new BackendWasmError(
      "INSTALL_REQUIRED",
      "Call prover.install() successfully before prove().",
    );
  }
  if (busy) {
    throw new BackendWasmError("BUSY", "The prover is already running.");
  }

  assertProverInput(input);
  busy = true;
  const proofChunkSize = 2 ** chunkSizeExponent;

  try {
    let runtimeInput;
    try {
      runtimeInput = await loadProverInputFromBinaryInput(installedRuntime, input);
    } catch (cause) {
      throw new BackendWasmError(
        "INVALID_INPUT",
        "The prover input binaries could not be decoded.",
        { cause },
      );
    }

    try {
      return await proveSnark(installedRuntime, runtimeInput, {
        denseSigma1MsmChunkPoints: proofChunkSize,
      });
    } catch (cause) {
      throw new BackendWasmError("RUNTIME_FAILED", "The prover runtime failed.", {
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
    throw new BackendWasmError("INSTALL_FAILED", "The prover runtime could not be installed.", {
      cause,
    });
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

function parseInstallOptions(options: ProverInstallOptions): number | undefined {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new BackendWasmError("INVALID_OPTION", "Prover install options must be an object.");
  }

  const unsupported = Object.keys(options).filter((key) => key !== "chunkSizeExponent");
  if (unsupported.length > 0) {
    throw new BackendWasmError(
      "INVALID_OPTION",
      `Unsupported prover install option: ${unsupported.join(", ")}.`,
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

function assertProverInput(input: ProverInput): void {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new BackendWasmError("INVALID_INPUT", "Prover input must be an object.");
  }

  assertBinary(input.witness, "witness");
  assertBinary(input.permutation, "permutation");
  assertBinary(input.instance, "instance");
  assertBinary(input.proverCrs, "proverCrs");
}

function assertBinary(value: Uint8Array, name: keyof ProverInput): void {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) {
    throw new BackendWasmError(
      "INVALID_INPUT",
      `Prover input '${name}' must be a non-empty Uint8Array.`,
    );
  }
}

function installationInfo(): ProverInstallationInfo {
  return {
    packageVersion: BACKEND_WASM_PACKAGE_VERSION,
    nativeBackendVersion: NATIVE_BACKEND_VERSION,
    subcircuitLibraryVersion: SUBCIRCUIT_LIBRARY_PACKAGE_VERSION,
    chunkSizeExponent,
    chunkSize: 2 ** chunkSizeExponent,
  };
}
