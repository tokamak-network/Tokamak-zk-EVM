import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { decodeBinaryArtifactFile } from "../../../src/artifacts/binary/binary-artifact-file.js";
import {
  convertCombinedSigmaRkyvToProverCrsBinary,
  createCombinedSigmaRkyvPayloadDecoder,
} from "../../../src/converter/conversion/rkyv-to-binary.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../../src/version.js";
import { loadCombinedSigmaPayloadDecoder } from "../../../tools/rkyv-decoder-wasm/src/node.js";
import { convertDecodedCombinedSigmaWithBatchMontgomery } from "./conversion-candidate.js";

type BenchmarkCase = "baseline" | "batch-montgomery";

async function main(): Promise<void> {
  const benchmarkCase = parseBenchmarkCase(process.argv[2]);
  const sourcePath = process.argv[3];
  const expectedPath = process.argv[4];
  if (sourcePath === undefined || expectedPath === undefined) {
    throw new Error(
      "Usage: benchmark-case <baseline|batch-montgomery> <combined_sigma.rkyv> <prover-crs.bin>",
    );
  }

  const source = new Uint8Array(await readFile(sourcePath));
  const decoder = await loadCombinedSigmaPayloadDecoder();
  const startedAt = performance.now();
  const artifact = benchmarkCase === "baseline"
    ? await convertCombinedSigmaRkyvToProverCrsBinary(source, {
      sourcePackageVersion: BACKEND_WASM_PACKAGE_VERSION,
      decoder: createCombinedSigmaRkyvPayloadDecoder(decoder.decodeCombinedSigmaPayload),
    })
    : await convertBatchCandidate(source, decoder.decodeCombinedSigmaPayload);
  const elapsedMs = performance.now() - startedAt;
  const expected = new Uint8Array(await readFile(expectedPath));

  assertBytesEqual(artifact, expected, "complete Prover CRS artifact");
  const [actualView, expectedView] = await Promise.all([
    decodeBinaryArtifactFile(artifact),
    decodeBinaryArtifactFile(expected),
  ]);
  if (actualView.sections.length !== expectedView.sections.length) {
    throw new Error("Generated Prover CRS section count mismatch.");
  }
  for (let index = 0; index < actualView.sections.length; index += 1) {
    const actualSection = actualView.sections[index];
    const expectedSection = expectedView.sections[index];
    if (
      actualSection.label !== expectedSection.label
      || actualSection.type !== expectedSection.type
      || actualSection.encoding !== expectedSection.encoding
      || actualSection.elementCount !== expectedSection.elementCount
      || actualSection.elementByteLength !== expectedSection.elementByteLength
    ) {
      throw new Error(`Generated Prover CRS section ${index} metadata mismatch.`);
    }
    assertBytesEqual(actualSection.data, expectedSection.data, actualSection.label);
  }

  console.log(JSON.stringify({
    benchmarkCase,
    elapsedMs,
    sourceBytes: source.byteLength,
    artifactBytes: artifact.byteLength,
    sectionCount: actualView.sections.length,
    parity: true,
  }));
}

async function convertBatchCandidate(
  source: Uint8Array,
  decodePayload: (input: Uint8Array) => Uint8Array | Promise<Uint8Array>,
): Promise<Uint8Array> {
  const decoded = await createCombinedSigmaRkyvPayloadDecoder(decodePayload)
    .decodeCombinedSigma(source);
  return convertDecodedCombinedSigmaWithBatchMontgomery(
    source,
    decoded,
    BACKEND_WASM_PACKAGE_VERSION,
  );
}

function parseBenchmarkCase(value: string | undefined): BenchmarkCase {
  if (value === "baseline" || value === "batch-montgomery") {
    return value;
  }
  throw new Error(`Unsupported Prover CRS conversion benchmark case: ${value ?? "missing"}.`);
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (
    actual.byteLength !== expected.byteLength
    || Buffer.compare(
      Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength),
      Buffer.from(expected.buffer, expected.byteOffset, expected.byteLength),
    ) !== 0
  ) {
    throw new Error(`${label} mismatch.`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
