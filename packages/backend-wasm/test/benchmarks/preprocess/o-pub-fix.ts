import { readFile } from "node:fs/promises";
import path from "node:path";

import { decodeBinaryArtifactFile } from "../../../src/artifacts/binary/binary-artifact-file.js";
import { loadPreprocessInputFromBinaryInput } from "../../../src/preprocess/api/binary-input.js";
import { createCurveRuntime, type CurveRuntime } from "../../../src/runtime/curve/curve.js";

const fixtureRoot = path.resolve("fixtures/small/runtime");
const g1AffineBytes = 96;

type Mode = "copied-elementwise" | "zero-copy-batch";

async function main(): Promise<void> {
  const processStarted = performance.now();
  const mode = parseMode(process.argv.slice(2));
  const [permutation, instance, preprocessCrs, verifierPreprocess] = await Promise.all([
    readBinary("permutation.bin"),
    readBinary("instance.bin"),
    readBinary("preprocess-crs.bin"),
    readBinary("verifier-preprocess.bin"),
  ]);
  const runtime = await createCurveRuntime();
  try {
    const input = await loadPreprocessInputFromBinaryInput(runtime, {
      permutation,
      instance,
      preprocessCrs,
    });
    const expected = await readExpectedOPubFix(verifierPreprocess);
    const operationStarted = performance.now();
    const point = mode === "copied-elementwise"
      ? await commitCopiedElementwise(
          runtime,
          input.crs.gammaInvOInst,
          input.functionInstance,
        )
      : await commitZeroCopyBatch(
          runtime,
          input.crs.gammaInvOInst,
          input.functionInstance,
        );
    const operationMs = performance.now() - operationStarted;

    assertPointParity(runtime.G1.toAffine(point), expected);
    console.log(JSON.stringify({
      mode,
      parity: true,
      pointCount: input.crs.gammaInvOInst.byteLength / g1AffineBytes,
      operationMs,
      processWallMs: performance.now() - processStarted,
      temporaryBytes: mode === "copied-elementwise"
        ? input.crs.gammaInvOInst.byteLength + input.functionInstance.byteLength
        : input.functionInstance.byteLength,
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
    }));
  } finally {
    await runtime.terminate();
  }
}

async function commitZeroCopyBatch(
  runtime: CurveRuntime,
  gammaInvOInst: Uint8Array,
  functionInstance: Uint8Array,
): Promise<Uint8Array> {
  const rawScalars = await runtime.Fr.batchFromMontgomeryBuffer(functionInstance);
  return runtime.G1.msmAffineRaw(gammaInvOInst, rawScalars);
}

async function commitCopiedElementwise(
  runtime: CurveRuntime,
  gammaInvOInst: Uint8Array,
  functionInstance: Uint8Array,
): Promise<Uint8Array> {
  const pointCount = gammaInvOInst.byteLength / g1AffineBytes;
  const copiedBases = new Uint8Array(gammaInvOInst.byteLength);
  const rawScalars = new Uint8Array(functionInstance.byteLength);
  for (let index = 0; index < pointCount; index += 1) {
    copiedBases.set(
      gammaInvOInst.subarray(index * g1AffineBytes, (index + 1) * g1AffineBytes),
      index * g1AffineBytes,
    );
    rawScalars.set(
      runtime.Fr.toRawLittleEndian(
        functionInstance.subarray(
          index * runtime.Fr.byteLength,
          (index + 1) * runtime.Fr.byteLength,
        ),
      ),
      index * runtime.Fr.byteLength,
    );
  }
  return runtime.G1.msmAffineRaw(copiedBases, rawScalars);
}

async function readExpectedOPubFix(fileBytes: Uint8Array): Promise<Uint8Array> {
  const file = await decodeBinaryArtifactFile(fileBytes);
  const points = file.sections[0]?.data;
  if (points === undefined || points.byteLength < g1AffineBytes * 3) {
    throw new Error("Native preprocess fixture does not contain O_pub_fix.");
  }
  return points.subarray(g1AffineBytes * 2, g1AffineBytes * 3);
}

function assertPointParity(actual: Uint8Array, expected: Uint8Array): void {
  if (
    actual.byteLength !== expected.byteLength
    || actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error("O_pub_fix benchmark commitment mismatch.");
  }
}

async function readBinary(fileName: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(fixtureRoot, fileName)));
}

function parseMode(argv: readonly string[]): Mode {
  if (argv.length !== 2 || argv[0] !== "--mode") {
    throw new Error("Usage: o-pub-fix --mode <copied-elementwise|zero-copy-batch>");
  }
  const mode = argv[1];
  if (mode === "copied-elementwise" || mode === "zero-copy-batch") {
    return mode;
  }
  throw new Error(`Unsupported O_pub_fix benchmark mode: ${mode}`);
}

await main();
