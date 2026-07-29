import { BackendWasmError } from "../../backend-wasm-error.js";
import {
  assertNamedBinaryInput,
  installCurveRuntime,
} from "../../api/public-api-utils.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../version.js";
import {
  NATIVE_BACKEND_VERSION,
  SUBCIRCUIT_LIBRARY_PACKAGE_VERSION,
} from "../../generated/setup.generated.js";
import {
  loadVerifierInputFromBinaryInput,
  type VerifierBinaryInput,
} from "./binary-input.js";
import { verifySnark } from "../protocol/verify-snark.js";

export interface VerifierInstallationInfo {
  readonly packageVersion: string;
  readonly nativeBackendVersion: string;
  readonly subcircuitLibraryVersion: string;
}

export type VerifierInput = VerifierBinaryInput;

let runtime: CurveRuntime | undefined;
let installationPromise: Promise<CurveRuntime> | undefined;
let busy = false;

export async function install(): Promise<VerifierInstallationInfo> {
  runtime = await requireInstalledRuntime();
  return {
    packageVersion: BACKEND_WASM_PACKAGE_VERSION,
    nativeBackendVersion: NATIVE_BACKEND_VERSION,
    subcircuitLibraryVersion: SUBCIRCUIT_LIBRARY_PACKAGE_VERSION,
  };
}

export async function verify(input: VerifierInput): Promise<boolean> {
  const installedRuntime = runtime;
  if (installedRuntime === undefined) {
    throw new BackendWasmError(
      "INSTALL_REQUIRED",
      "Call verifier.install() successfully before verify().",
    );
  }
  if (busy) {
    throw new BackendWasmError("BUSY", "The verifier is already running.");
  }

  assertNamedBinaryInput(input, "Verifier", ["proof", "instance", "verifierPreprocess"]);
  busy = true;

  try {
    let runtimeInput;
    try {
      runtimeInput = await loadVerifierInputFromBinaryInput(installedRuntime, input);
    } catch (cause) {
      throw new BackendWasmError(
        "INVALID_INPUT",
        "The verifier input binaries could not be decoded.",
        { cause },
      );
    }

    try {
      return await verifySnark(installedRuntime, runtimeInput);
    } catch (cause) {
      throw new BackendWasmError("RUNTIME_FAILED", "The verifier runtime failed.", {
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

  const pending = installCurveRuntime("The verifier runtime could not be installed.");
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
