import { BackendWasmError } from "../../backend-wasm-error.js";
import {
  assertNamedBinaryInput,
  installCurveRuntime,
  parseChunkSizeExponent,
} from "../../api/public-api-utils.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import {
  loadProverInputFromBinaryInput,
  type ProverBinaryInput,
} from "./binary-input.js";
import { createVerifierProofArtifactFromProverOutput } from "./proof-output.js";
import {
  createProverProtocolSession,
  type ProverProtocolSession,
} from "../protocol/integrated-prover.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../version.js";
import {
  NATIVE_BACKEND_VERSION,
  SUBCIRCUIT_LIBRARY_PACKAGE_VERSION,
} from "../../generated/setup.generated.js";

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

export interface ProverSession {
  proveArithmetic(): Promise<void>;
  proveCopy(): Promise<void>;
  proveBinding(): Promise<void>;
  finalize(): Promise<Uint8Array>;
  dispose(): void;
}

let runtime: CurveRuntime | undefined;
let installationPromise: Promise<CurveRuntime> | undefined;
let busy = false;
let chunkSizeExponent = DEFAULT_CHUNK_SIZE_EXPONENT;

export async function install(options: ProverInstallOptions = {}): Promise<ProverInstallationInfo> {
  const requestedExponent = parseChunkSizeExponent(options, "Prover");
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
  const session = await begin(input);
  try {
    await session.proveArithmetic();
    await session.proveCopy();
    await session.proveBinding();
    return await session.finalize();
  } catch (error) {
    session.dispose();
    throw error;
  }
}

export async function begin(input: ProverInput): Promise<ProverSession> {
  const installedRuntime = runtime;
  if (installedRuntime === undefined) {
    throw new BackendWasmError(
      "INSTALL_REQUIRED",
      "Call prover.install() successfully before begin() or prove().",
    );
  }
  if (busy) {
    throw new BackendWasmError("BUSY", "The prover is already running.");
  }

  assertNamedBinaryInput(input, "Prover", ["witness", "permutation", "instance", "proverCrs"]);
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
    return new PublicProverSession(
      createProverProtocolSession(installedRuntime, runtimeInput, {
        denseSigma1MsmChunkPoints: proofChunkSize,
      }),
      releaseBusy,
    );
  } catch (error) {
    busy = false;
    throw error;
  }
}

class PublicProverSession implements ProverSession {
  private active = true;
  private operationRunning = false;
  private disposeRequested = false;
  private released = false;

  constructor(
    private readonly protocol: ProverProtocolSession,
    private readonly release: () => void,
  ) {}

  async proveArithmetic(): Promise<void> {
    await this.runOperation(() => this.protocol.proveArithmetic());
  }

  async proveCopy(): Promise<void> {
    await this.runOperation(() => this.protocol.proveCopy());
  }

  async proveBinding(): Promise<void> {
    await this.runOperation(() => this.protocol.proveBinding());
  }

  async finalize(): Promise<Uint8Array> {
    return this.runOperation(async () => {
      const proof = await createVerifierProofArtifactFromProverOutput(
        await this.protocol.finalize(),
      );
      this.dispose();
      return proof;
    });
  }

  dispose(): void {
    if (this.released) {
      return;
    }
    this.active = false;
    this.disposeRequested = true;
    if (!this.operationRunning) {
      this.finishDispose();
    }
  }

  private finishDispose(): void {
    if (this.released) {
      return;
    }
    this.released = true;
    this.protocol.dispose();
    this.release();
  }

  private async runOperation<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.active) {
      throw new BackendWasmError("RUNTIME_FAILED", "The prover session is no longer active.");
    }
    if (this.operationRunning) {
      throw new BackendWasmError(
        "RUNTIME_FAILED",
        "Another operation is already running on this prover session.",
      );
    }
    this.operationRunning = true;
    try {
      return await operation();
    } catch (cause) {
      this.dispose();
      if (cause instanceof BackendWasmError) {
        throw cause;
      }
      throw new BackendWasmError("RUNTIME_FAILED", "The prover runtime failed.", {
        cause,
      });
    } finally {
      this.operationRunning = false;
      if (this.disposeRequested) {
        this.finishDispose();
      }
    }
  }
}

async function requireInstalledRuntime(): Promise<CurveRuntime> {
  if (runtime !== undefined) {
    return runtime;
  }
  if (installationPromise !== undefined) {
    return installationPromise;
  }

  const pending = installCurveRuntime("The prover runtime could not be installed.");
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

function installationInfo(): ProverInstallationInfo {
  return {
    packageVersion: BACKEND_WASM_PACKAGE_VERSION,
    nativeBackendVersion: NATIVE_BACKEND_VERSION,
    subcircuitLibraryVersion: SUBCIRCUIT_LIBRARY_PACKAGE_VERSION,
    chunkSizeExponent,
    chunkSize: 2 ** chunkSizeExponent,
  };
}

function releaseBusy(): void {
  busy = false;
}
