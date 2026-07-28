import {
  install as installPreprocess,
  preprocess,
} from "../../src/preprocess/index.js";
import { loadPreprocessInputFromBinaryInput } from "../../src/preprocess/api/binary-input.js";
import { createCurveRuntime } from "../../src/runtime/curve/curve.js";
import {
  install as installVerifier,
  verify,
} from "../../src/verifier/index.js";
import { preprocessSpeedCandidate } from "../benchmarks/preprocess/pipeline-candidate.js";
import { preprocessLegacyBaseline } from "../benchmarks/preprocess/pipeline-baseline.js";

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

type BrowserPreprocessMode =
  | "production"
  | "legacy-baseline"
  | "selected-candidate";

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
  let actual: Uint8Array;
  let preprocessMs: number;
  if (mode === "production") {
    const installation = await installPreprocess();
    if (installation.chunkSizeExponent !== 17) {
      throw new Error(
        `Browser preprocess default chunk exponent must be 17; received ${installation.chunkSizeExponent}.`,
      );
    }
    const started = performance.now();
    actual = await preprocess({
      permutation,
      instance,
      preprocessCrs,
    });
    preprocessMs = performance.now() - started;
  } else {
    const runtime = await createCurveRuntime();
    try {
      const input = await loadPreprocessInputFromBinaryInput(runtime, {
        permutation,
        instance,
        preprocessCrs,
      });
      const started = performance.now();
      actual = mode === "legacy-baseline"
        ? await preprocessLegacyBaseline(runtime, input)
        : await preprocessSpeedCandidate(runtime, input);
      preprocessMs = performance.now() - started;
    } finally {
      await runtime.terminate();
    }
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
  if (value === null || value === "production") {
    return "production";
  }
  if (value === "legacy-baseline" || value === "selected-candidate") {
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
