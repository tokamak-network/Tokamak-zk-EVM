import { assertNamedBinaryInput, assertNamedCrsInput, installCurveRuntime, parseChunkSizeExponent } from "../../api/public-api-utils.js";
import { assertRuntimeLibraryCompatibility } from "../../artifacts/binary/compatibility.js";
import { BackendWasmError } from "../../backend-wasm-error.js";
import {
  NATIVE_BACKEND_VERSION,
  SUBCIRCUIT_LIBRARY_PACKAGE_VERSION,
  GENERATED_SETUP_PARAMS,
} from "../../generated/active/setup.generated.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import { encodeUnivariateProof } from "../../univariate/proof.js";
import { proveUnivariateReference } from "../../univariate/reference-prover.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../version.js";
import { loadProverInputFromBinaryInput, type ProverBinaryInput } from "./binary-input.js";

const DEFAULT_CHUNK_SIZE_EXPONENT = 18;

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

export interface ProverOptions {
  /** Check SHA-256 of loaded CRS chunks. Defaults to false, independently for each call. */
  readonly checkDigests?: boolean;
}

let runtime: CurveRuntime | undefined;
let installationPromise: Promise<CurveRuntime> | undefined;
let busy = false;
let chunkSizeExponent = DEFAULT_CHUNK_SIZE_EXPONENT;

export async function install(options: ProverInstallOptions = {}): Promise<ProverInstallationInfo> {
  assertRuntimeLibraryCompatibility();
  const requestedExponent = parseChunkSizeExponent(options, "Prover");
  runtime = await requireInstalledRuntime();
  if (requestedExponent !== undefined && requestedExponent !== chunkSizeExponent) {
    if (busy) throw new BackendWasmError("BUSY", "The prover chunk size cannot change while proving.");
    chunkSizeExponent = requestedExponent;
  }
  return installationInfo();
}

/** Produces one complete current-protocol F5 proof in a single operation. */
export async function prove(input: ProverInput, options: ProverOptions = {}): Promise<Uint8Array> {
  if (runtime === undefined) {
    throw new BackendWasmError("INSTALL_REQUIRED", "Call prover.install() successfully before prove().");
  }
  if (busy) throw new BackendWasmError("BUSY", "The prover is already running.");
  assertNamedBinaryInput(input, "Prover", ["witness", "selector", "permutation", "instance"]);
  assertNamedCrsInput(input, "Prover", ["proverCrs"]);
  busy = true;
  try {
    const parsed = await loadProverInputFromBinaryInput(runtime, input, options.checkDigests === true);
    const proof = await proveUnivariateReference(runtime, {
      ...parsed,
      setup: GENERATED_SETUP_PARAMS,
      chunkPoints: 2 ** chunkSizeExponent,
    });
    return await encodeUnivariateProof(runtime, proof);
  } catch (cause) {
    if (cause instanceof BackendWasmError) throw cause;
    throw new BackendWasmError("RUNTIME_FAILED", "The univariate prover runtime failed.", { cause });
  } finally {
    busy = false;
  }
}

async function requireInstalledRuntime(): Promise<CurveRuntime> {
  if (runtime !== undefined) return runtime;
  if (installationPromise !== undefined) return installationPromise;
  const pending = installCurveRuntime("The prover runtime could not be installed.");
  installationPromise = pending;
  try {
    return await pending;
  } catch (error) {
    if (installationPromise === pending) installationPromise = undefined;
    throw error;
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
