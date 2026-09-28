import { readFile } from "node:fs/promises";
import path from "node:path";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";

import {
  BackendWasmError,
  install,
  preprocess,
} from "../../../src/preprocess/index.js";

const fixtureRoot = path.resolve("fixtures/small/runtime");
async function main(): Promise<void> {
  const permutation = await readBinary("permutation.bin");
  const invalidCrs = { manifest: {}, async loadChunk() { return new Uint8Array(); } };
  await assertBackendError(() => preprocess({} as never), "INSTALL_REQUIRED");
  await assertBackendError(() => install({ chunkSizeExponent: 9 }), "INVALID_OPTION");
  await assertBackendError(() => install({ chunkSizeExponent: 20 }), "INVALID_OPTION");
  await assertBackendError(() => install({ chunkSizeExponent: 10.5 }), "INVALID_OPTION");
  await assertBackendError(() => install({ unsupported: true } as never), "INVALID_OPTION");
  assertInstallation(await install(), 17);
  assertInstallation(await install({ chunkSizeExponent: 18 }), 18);
  assertInstallation(await install({ chunkSizeExponent: 17 }), 17);
  await assertBackendError(() => preprocess({
    permutation,
    instance: new Uint8Array([1]),
    preprocessCrs: invalidCrs,
  } as never), "INVALID_INPUT");
  await assertBackendError(() => preprocess({
    instance: new Uint8Array([1]),
    selector: new Uint8Array([1]),
    permutation,
    preprocessCrs: invalidCrs,
  }), "INVALID_INPUT");
  await assertBackendError(() => preprocess({
    instance: new Uint8Array([1]),
    selector: new Uint8Array([1]),
    permutation: new Uint8Array([1]),
    preprocessCrs: invalidCrs,
  }), "INVALID_INPUT");
  console.log("Checked univariate preprocess public API installation and input admission");
}

async function readBinary(fileName: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(fixtureRoot, fileName)));
}

async function assertBackendError(
  execute: () => Promise<unknown>,
  expectedCode: BackendWasmError["code"],
): Promise<void> {
  try {
    await execute();
  } catch (error) {
    if (error instanceof BackendWasmError && error.code === expectedCode) {
      return;
    }
    throw error;
  }
  throw new Error(`Expected BackendWasmError code ${expectedCode}.`);
}

function assertInstallation(
  info: Awaited<ReturnType<typeof install>>,
  expectedExponent: number,
): void {
  if (info.chunkSizeExponent !== expectedExponent || info.chunkSize !== 2 ** expectedExponent) {
    throw new Error(`Expected chunk exponent ${expectedExponent}; received ${info.chunkSizeExponent}.`);
  }
}
try {
  await main();
}
finally {
  await (await createCurveRuntime()).terminate();
}
