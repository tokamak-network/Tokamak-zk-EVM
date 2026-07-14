import {
  BinaryArtifactFileKind,
  createCombinedSigmaRkyvPayloadDecoder,
  decodeBinaryArtifactFile,
  convertCombinedSigmaRkyvToProverCrsBinary,
} from "../src/index.js";

const magic = new TextEncoder().encode("TKCRS001");
const sectionLengths = [
  6 * 96,
  2 * 96,
  1 * 96,
  3 * 96,
  1 * 96,
  3 * 96,
  1 * 96,
  2 * 96,
  10 * 192,
];

async function main(): Promise<void> {
  const payload = createSyntheticCombinedSigmaPayload();
  const decoder = createCombinedSigmaRkyvPayloadDecoder(() => payload);
  const artifactBytes = await convertCombinedSigmaRkyvToProverCrsBinary(new Uint8Array([1, 2, 3]), {
    sourcePackageVersion: "2.1.1",
    decoder,
  });
  const artifact = await decodeBinaryArtifactFile(artifactBytes);

  assertEqual(artifact.kind, BinaryArtifactFileKind.ProverCrs, "artifact kind");
  assertEqual(artifact.sections.length, sectionLengths.length, "section count");
  assertEqual(artifact.sections[0].label, "sigma.g1", "first section label");
  assertEqual(artifact.sections[0].byteLength, sectionLengths[0], "sigma.g1 byte length");
  assertEqual(artifact.sections[8].label, "sigma.g2", "last section label");
  assertEqual(artifact.sections[8].byteLength, sectionLengths[8], "sigma.g2 byte length");

  console.log("Checked rkyv decoder payload adapter");
}

function createSyntheticCombinedSigmaPayload(): Uint8Array {
  const headerBytes = magic.byteLength + 4 + sectionLengths.length * 4;
  const bodyBytes = sectionLengths.reduce((sum, length) => sum + length, 0);
  const output = new Uint8Array(headerBytes + bodyBytes);
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);

  output.set(magic, 0);
  view.setUint32(magic.byteLength, sectionLengths.length, true);

  let offset = magic.byteLength + 4;
  for (const length of sectionLengths) {
    view.setUint32(offset, length, true);
    offset += 4;
  }

  for (let sectionIndex = 0; sectionIndex < sectionLengths.length; sectionIndex += 1) {
    for (let byteIndex = 0; byteIndex < sectionLengths[sectionIndex]; byteIndex += 1) {
      output[offset + byteIndex] = (sectionIndex + byteIndex) & 0xff;
    }
    offset += sectionLengths[sectionIndex];
  }

  return output;
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${String(expected)}, got ${String(actual)}.`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`rkyv decoder payload check failed: ${message}`);
  process.exitCode = 1;
});
