import {
  decodeBinaryArtifactFile,
} from "../../../src/artifacts/binary/binary-artifact-file.js";
import { BinaryArtifactFileKind } from "../../../src/artifacts/binary/binary-format.js";
import {
  convertCombinedSigmaRkyvToCrsBinaries,
  createCombinedSigmaRkyvPayloadDecoder,
} from "../../../src/converter/conversion/rkyv-to-binary.js";

const magic = new TextEncoder().encode("TKCRS001");
const sectionLengths = [
  6 * 96,
  16 * 96,
  3 * 96,
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
  const artifacts = await convertCombinedSigmaRkyvToCrsBinaries(new Uint8Array([1, 2, 3]), {
    sourcePackageVersion: "2.1.1",
    decoder,
    setup: {
      l: 3,
      l_free: 1,
      l_D: 5,
      n: 2,
      s_max: 2,
    },
  });
  const prover = await decodeBinaryArtifactFile(artifacts.proverCrs);
  const preprocess = await decodeBinaryArtifactFile(artifacts.preprocessCrs);
  const verifier = await decodeBinaryArtifactFile(artifacts.verifierCrs);

  assertEqual(prover.kind, BinaryArtifactFileKind.ProverCrs, "prover artifact kind");
  assertEqual(prover.sections.length, sectionLengths.length, "prover section count");
  assertEqual(prover.sections[0].label, "sigma.g1", "prover first section label");
  assertEqual(prover.sections[8].label, "sigma.g2", "prover last section label");
  assertEqual(preprocess.kind, BinaryArtifactFileKind.PreprocessCrs, "preprocess artifact kind");
  assertEqual(preprocess.sections[0].elementCount, 4, "compact xy-powers point count");
  assertEqual(preprocess.sections[1].elementCount, 2, "compact gamma point count");
  assertEqual(verifier.kind, BinaryArtifactFileKind.VerifierCrs, "verifier artifact kind");
  assertEqual(verifier.sections[0].elementCount, 4, "verifier G1 point count");
  assertEqual(verifier.sections[1].elementCount, 10, "verifier G2 point count");

  console.log("Checked three-output rkyv decoder payload adapter");
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
