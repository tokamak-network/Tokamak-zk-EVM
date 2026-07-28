import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  BackendWasmError,
  install,
  preprocess,
  type PreprocessInput,
} from "../../../src/preprocess/index.js";
import {
  decodeBinaryArtifactFile,
  requireBinaryArtifactSection,
} from "../../../src/artifacts/binary/binary-artifact-file.js";
import {
  BinarySectionEncoding,
  BinarySectionType,
} from "../../../src/artifacts/binary/binary-format.js";

const fixtureRoot = path.resolve("fixtures/small/runtime");

async function main(): Promise<void> {
  const input = await readInput();
  const expected = await readBinary("verifier-preprocess.bin");

  await assertBackendError(() => preprocess(input), "INSTALL_REQUIRED");
  await assertBackendError(
    () => install({ chunkSizeExponent: 9 }),
    "INVALID_OPTION",
  );
  await assertBackendError(
    () => install({ chunkSizeExponent: 20 }),
    "INVALID_OPTION",
  );
  await assertBackendError(
    () => install({ chunkSizeExponent: 10.5 }),
    "INVALID_OPTION",
  );
  await assertBackendError(
    () => install({ unsupported: true } as never),
    "INVALID_OPTION",
  );

  assertInstallation(await install(), 17);
  assertInstallation(await install({ chunkSizeExponent: 18 }), 18);
  assertInstallation(await install(), 18);
  assertInstallation(await install({ chunkSizeExponent: 17 }), 17);

  await assertBackendError(
    () => preprocess({
      ...input,
      permutation: new Uint8Array([1]),
    }),
    "INVALID_INPUT",
  );
  const outOfRangePermutation = await mutateFirstPermutationRow(
    input.permutation,
    4096,
  );
  await assertBackendError(
    () => preprocess({
      ...input,
      permutation: outOfRangePermutation,
    }),
    "INVALID_INPUT",
  );
  assertBytesEqual(await preprocess(input), expected, "failed-call recovery");

  const active = preprocess(input);
  await assertBackendError(() => preprocess(input), "BUSY");
  await assertBackendError(
    () => install({ chunkSizeExponent: 18 }),
    "BUSY",
  );
  assertBytesEqual(await active, expected, "overlapping-call recovery");

  assertInstallation(await install({ chunkSizeExponent: 18 }), 18);
  assertBytesEqual(await preprocess(input), expected, "repeated call");

  console.log("Checked preprocess public API installation, busy state, recovery, and parity");
}

async function mutateFirstPermutationRow(
  artifact: Uint8Array,
  row: number,
): Promise<Uint8Array> {
  const copy = artifact.slice();
  const file = await decodeBinaryArtifactFile(copy);
  const entries = requireBinaryArtifactSection(file, {
    type: BinarySectionType.Permutation,
    encoding: BinarySectionEncoding.Bytes,
    label: "permutation.entries",
  }).data;
  new DataView(
    entries.buffer,
    entries.byteOffset,
    entries.byteLength,
  ).setUint32(0, row, true);
  return copy;
}

async function readInput(): Promise<PreprocessInput> {
  const [permutation, instance, preprocessCrs] = await Promise.all([
    readBinary("permutation.bin"),
    readBinary("instance.bin"),
    readBinary("preprocess-crs.bin"),
  ]);
  return { permutation, instance, preprocessCrs };
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
  if (
    info.chunkSizeExponent !== expectedExponent
    || info.chunkSize !== 2 ** expectedExponent
  ) {
    throw new Error(
      `Expected chunk exponent ${expectedExponent}; received ${info.chunkSizeExponent}.`,
    );
  }
}

function assertBytesEqual(
  actual: Uint8Array,
  expected: Uint8Array,
  label: string,
): void {
  if (
    actual.byteLength !== expected.byteLength
    || actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(`Preprocess public API ${label} output mismatch.`);
  }
}

await main();
process.exit(0);
