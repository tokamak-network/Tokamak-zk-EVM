import {
  BackendWasmError,
  install,
  verify,
  type VerifierInput,
} from "../../src/verifier/index.js";

declare global {
  interface Window {
    __tokamakVerifierResult?: {
      readonly status: "pending" | "ok" | "error";
      readonly valid?: boolean;
      readonly error?: string;
    };
  }
}

window.__tokamakVerifierResult = { status: "pending" };

main().catch((error: unknown) => {
  window.__tokamakVerifierResult = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  };
});

async function main(): Promise<void> {
  const binaryFixture = await loadPreparedBinaryVerifierFixture();
  await expectBackendError(() => verify(binaryFixture), "INSTALL_REQUIRED");

  const [firstInstall, secondInstall] = await Promise.all([install(), install()]);
  if (
    firstInstall.packageVersion !== secondInstall.packageVersion
    || firstInstall.nativeBackendVersion !== secondInstall.nativeBackendVersion
    || firstInstall.subcircuitLibraryVersion !== secondInstall.subcircuitLibraryVersion
  ) {
    throw new Error("Concurrent verifier install calls returned inconsistent metadata.");
  }

  const result = await verify(binaryFixture);
  if (!result) {
    throw new Error("Browser verifier rejected the prepared runtime proof fixture.");
  }

  window.__tokamakVerifierResult = {
    status: "ok",
    valid: result,
  };
}

async function loadPreparedBinaryVerifierFixture(): Promise<VerifierInput> {
  const [proof, instance, verifierPreprocess] = await Promise.all([
    fetchBinary("/fixtures/small/runtime/proof.bin"),
    fetchBinary("/fixtures/small/runtime/instance.bin"),
    fetchBinary("/fixtures/small/runtime/verifier-preprocess.bin"),
  ]);

  return { proof, instance, verifierPreprocess };
}

async function fetchBinary(path: string): Promise<Uint8Array> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(describePreparedFixtureFetchFailure(path, response.status));
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function expectBackendError(
  operation: () => Promise<unknown>,
  expectedCode: BackendWasmError["code"],
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof BackendWasmError && error.code === expectedCode) {
      return;
    }
    throw error;
  }
  throw new Error(`Expected BackendWasmError code ${expectedCode}.`);
}

function describePreparedFixtureFetchFailure(path: string, status: number): string {
  if (path.startsWith("/fixtures/small/runtime/")) {
    return [
      `Failed to fetch prepared verifier runtime fixture file ${path}: ${status}.`,
      "Prepare owner package outputs, run npm run fixtures:copy, then run npm run fixtures:prepare.",
    ].join(" ");
  }

  return `Failed to fetch ${path}: ${status}.`;
}
