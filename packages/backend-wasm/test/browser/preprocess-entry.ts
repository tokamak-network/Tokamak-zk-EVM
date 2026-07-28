import { loadPreprocessInputFromBinaryInput } from "../../src/preprocess/api/binary-input.js";
import { preprocessSnark } from "../../src/preprocess/protocol/preprocess-snark.js";
import { createCurveRuntime } from "../../src/runtime/curve/curve.js";
import {
  install as installVerifier,
  verify,
} from "../../src/verifier/index.js";
import { preprocessSpeedCandidate } from "../benchmarks/preprocess/pipeline-candidate.js";

declare global {
  interface Window {
    __tokamakPreprocessResult?: BrowserPreprocessResult;
  }
}

interface BrowserPreprocessResult {
  readonly status: "pending" | "ok" | "error";
  readonly mode?: BrowserPreprocessMode;
  readonly nativeParity?: boolean;
  readonly verifierAccepted?: boolean;
  readonly preprocessMs?: number;
  readonly error?: string;
}

type BrowserPreprocessMode = "current" | "speed-candidate";

window.__tokamakPreprocessResult = { status: "pending" };

main().catch((error: unknown) => {
  window.__tokamakPreprocessResult = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  };
});

async function main(): Promise<void> {
  const mode = parseMode(new URL(window.location.href).searchParams.get("mode"));
  const [permutation, instance, preprocessCrs, expected, proof] = await Promise.all([
    fetchBinary("/fixtures/small/runtime/permutation.bin"),
    fetchBinary("/fixtures/small/runtime/instance.bin"),
    fetchBinary("/fixtures/small/runtime/preprocess-crs.bin"),
    fetchBinary("/fixtures/small/runtime/verifier-preprocess.bin"),
    fetchBinary("/fixtures/small/runtime/proof.bin"),
  ]);
  const runtime = await createCurveRuntime();
  let actual: Uint8Array;
  let preprocessMs: number;
  try {
    const input = await loadPreprocessInputFromBinaryInput(runtime, {
      permutation,
      instance,
      preprocessCrs,
    });
    const started = performance.now();
    actual = mode === "current"
      ? await preprocessSnark(runtime, input)
      : await preprocessSpeedCandidate(runtime, input);
    preprocessMs = performance.now() - started;
  } finally {
    await runtime.terminate();
  }

  assertBytesEqual(actual, expected);
  await installVerifier();
  const verifierAccepted = await verify({
    proof,
    instance,
    verifierPreprocess: actual,
  });
  if (!verifierAccepted) {
    throw new Error("Verifier rejected the native proof with browser-generated preprocess.");
  }

  window.__tokamakPreprocessResult = {
    status: "ok",
    mode,
    nativeParity: true,
    verifierAccepted,
    preprocessMs,
  };
}

function parseMode(value: string | null): BrowserPreprocessMode {
  if (value === null || value === "current") {
    return "current";
  }
  if (value === "speed-candidate") {
    return value;
  }
  throw new Error(`Unsupported browser preprocess mode: ${value}`);
}

async function fetchBinary(path: string): Promise<Uint8Array> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch prepared preprocess runtime fixture ${path}: ${response.status}.`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array): void {
  if (actual.byteLength !== expected.byteLength) {
    throw new Error(
      `Browser preprocess byte length mismatch: expected ${expected.byteLength}, `
        + `received ${actual.byteLength}.`,
    );
  }
  for (let index = 0; index < actual.byteLength; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(`Browser preprocess parity mismatch at byte ${index}.`);
    }
  }
}
