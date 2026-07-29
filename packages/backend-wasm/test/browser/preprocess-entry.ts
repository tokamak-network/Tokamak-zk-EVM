import {
  install as installPreprocess,
  preprocess,
} from "../../src/preprocess/index.js";
import {
  install as installVerifier,
  verify,
} from "../../src/verifier/index.js";
import { assertBytesEqual } from "../support/bytes.js";

declare global {
  interface Window {
    __tokamakPreprocessResult?: BrowserPreprocessResult;
  }
}

  interface BrowserPreprocessResult {
    readonly status: "pending" | "ok" | "error";
    readonly nativeParity?: boolean;
  readonly verifierAccepted?: boolean;
  readonly preprocessMs?: number;
  readonly chunkSizeExponent?: number;
  readonly error?: string;
}

window.__tokamakPreprocessResult = { status: "pending" };

main().catch((error: unknown) => {
  window.__tokamakPreprocessResult = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  };
});

async function main(): Promise<void> {
  const searchParams = new URL(window.location.href).searchParams;
  const chunkSizeExponent = parseChunkSizeExponent(
    searchParams.get("chunkSizeExponent"),
  );
  const [permutation, instance, preprocessCrs, expected, proof] = await Promise.all([
    fetchBinary("/fixtures/small/runtime/permutation.bin"),
    fetchBinary("/fixtures/small/runtime/instance.bin"),
    fetchBinary("/fixtures/small/runtime/preprocess-crs.bin"),
    fetchBinary("/fixtures/small/runtime/verifier-preprocess.bin"),
    fetchBinary("/fixtures/small/runtime/proof.bin"),
  ]);
  const installation = await installPreprocess(
    chunkSizeExponent === undefined ? {} : { chunkSizeExponent },
  );
  if (
    chunkSizeExponent === undefined
    && installation.chunkSizeExponent !== 17
  ) {
    throw new Error(
      `Browser preprocess default chunk exponent must be 17; received ${installation.chunkSizeExponent}.`,
    );
  }
  if (
    chunkSizeExponent !== undefined
    && installation.chunkSizeExponent !== chunkSizeExponent
  ) {
    throw new Error(
      `Browser preprocess chunk exponent must be ${chunkSizeExponent}; received ${installation.chunkSizeExponent}.`,
    );
  }
  const started = performance.now();
  const actual = await preprocess({
    permutation,
    instance,
    preprocessCrs,
  });
  const preprocessMs = performance.now() - started;

  assertBytesEqual(actual, expected, "browser preprocess parity");
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
    nativeParity: true,
    verifierAccepted,
    preprocessMs,
    chunkSizeExponent,
  };
}

function parseChunkSizeExponent(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  const exponent = Number(value);
  if (!Number.isInteger(exponent) || exponent < 10 || exponent > 19) {
    throw new Error(`Unsupported browser preprocess chunk exponent: ${value}`);
  }
  return exponent;
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
