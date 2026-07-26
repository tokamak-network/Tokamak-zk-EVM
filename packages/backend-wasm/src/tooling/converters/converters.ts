import { createBinaryArtifactFile, decodeBinaryArtifactFile } from "../../artifacts/binary/binary-artifact-file.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../prover/api/version.js";
import {
  BinaryArtifactFileKind,
  type BinaryArtifactFileView,
  BinarySectionEncoding,
  BinarySectionType,
  type BinarySectionView,
} from "../../artifacts/binary/binary-format.js";
import { createCurveRuntime, type CurveRuntime } from "../../runtime/curve/curve.js";
import type {
  ConverterArtifactJson,
  ConvertProofBinaryInput,
  ConvertProofInput,
  ConvertProofJsonInput,
} from "./types.js";
import {
  concatBytes,
  isRecord,
  parseHexStringArray,
  stripHex,
} from "./conversion-utils.js";
export { inspectBinary } from "./binary-inspection.js";
export { convertInstance } from "./instance-converter.js";
export { convertPermutation } from "./permutation-converter.js";
export { convertWitness } from "./witness-converter.js";
import {
  convertCombinedSigmaRkyvToProverCrsBinary,
  createCombinedSigmaRkyvPayloadDecoder,
  createUnavailableRkyvArchiveDecoder,
  decodeCombinedSigmaRkyvPayload,
} from "./rkyv-to-binary.js";

export {
  convertCombinedSigmaRkyvToProverCrsBinary,
  createCombinedSigmaRkyvPayloadDecoder,
  createUnavailableRkyvArchiveDecoder,
  decodeCombinedSigmaRkyvPayload,
};
export type { DecodedCombinedSigmaRkyv, RkyvArchiveDecoder, RkyvToBinaryConverterOptions } from "./rkyv-to-binary.js";
export type {
  BinaryArtifactInspection,
  BinaryDigestInspection,
  BinaryInspectionOptions,
  BinarySectionInspection,
  ConverterArtifactJson,
  ConvertProofBinaryInput,
  ConvertProofInput,
  ConvertProofJsonInput,
} from "./types.js";

export function convertProof(input: ConvertProofJsonInput): Promise<Uint8Array>;
export function convertProof(input: ConvertProofBinaryInput): Promise<ConverterArtifactJson>;
export async function convertProof(input: ConvertProofInput): Promise<Uint8Array | ConverterArtifactJson> {
  if (input.sourceFormat === "binary") {
    return convertProofBinaryToNativeJson(input.proof);
  }

  const runtime = await createCurveRuntime();
  try {
    return createVerifierProofArtifact(runtime, input.proof, BACKEND_WASM_PACKAGE_VERSION);
  } finally {
    await runtime.terminate();
  }
}

export async function convertVerifierPreprocess(preprocess: unknown): Promise<Uint8Array> {
  const runtime = await createCurveRuntime();
  try {
    return createVerifierPreprocessArtifact(runtime, preprocess, BACKEND_WASM_PACKAGE_VERSION);
  } finally {
    await runtime.terminate();
  }
}

async function convertProofBinaryToNativeJson(proof: Uint8Array): Promise<ConverterArtifactJson> {
  const artifactFile = await decodeBinaryArtifactFile(proof);
  const proofG1 = requireBinarySection(artifactFile, {
    kind: BinaryArtifactFileKind.VerifierProof,
    type: BinarySectionType.Proof,
    encoding: BinarySectionEncoding.FfjsG1Affine96,
    label: "proof.g1",
    elementCount: 19,
    elementByteLength: 96,
  });
  const proofEvals = requireBinarySection(artifactFile, {
    kind: BinaryArtifactFileKind.VerifierProof,
    type: BinarySectionType.Proof,
    encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
    label: "proof.evals",
    elementCount: 4,
    elementByteLength: 32,
  });
  const runtime = await createCurveRuntime();

  try {
    const proofEntriesPart1: string[] = [];
    const proofEntriesPart2: string[] = [];
    for (let index = 0; index < proofG1.elementCount; index += 1) {
      const point = proofG1.data.subarray(index * 96, (index + 1) * 96);
      const affine = runtime.G1.formatAffine(point);
      appendSplitG1Coordinate(proofEntriesPart1, proofEntriesPart2, affine.x);
      appendSplitG1Coordinate(proofEntriesPart1, proofEntriesPart2, affine.y);
    }

    for (let index = 0; index < proofEvals.elementCount; index += 1) {
      proofEntriesPart2.push(runtime.Fr.toHex(proofEvals.data.subarray(index * 32, (index + 1) * 32)));
    }

    return {
      proof_entries_part1: proofEntriesPart1,
      proof_entries_part2: proofEntriesPart2,
    };
  } finally {
    await runtime.terminate();
  }
}

interface FormattedPreprocessJson {
  readonly preprocess_entries_part1: readonly string[];
  readonly preprocess_entries_part2: readonly string[];
}

interface FormattedProofJson {
  readonly proof_entries_part1: readonly string[];
  readonly proof_entries_part2: readonly string[];
}

async function createVerifierProofArtifact(
  runtime: CurveRuntime,
  raw: unknown,
  sourcePackageVersion: string,
): Promise<Uint8Array> {
  const proof = parseFormattedProofJson(raw);
  const points = recoverG1Points(runtime, proof.proof_entries_part1, proof.proof_entries_part2, 19);
  const scalarSlice = proof.proof_entries_part2.slice(38);

  if (scalarSlice.length !== 4) {
    throw new Error("Formatted proof must contain four scalar evaluations.");
  }

  return createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.VerifierProof,
    sourcePackageVersion,
    sections: [
      {
        type: BinarySectionType.Proof,
        encoding: BinarySectionEncoding.FfjsG1Affine96,
        label: "proof.g1",
        elementCount: 19,
        elementByteLength: 96,
        data: concatBytes(points),
      },
      {
        type: BinarySectionType.Proof,
        encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
        label: "proof.evals",
        elementCount: 4,
        elementByteLength: runtime.Fr.byteLength,
        data: concatBytes(scalarSlice.map((scalar) => runtime.Fr.fromHex(scalar))),
      },
    ],
  });
}

async function createVerifierPreprocessArtifact(
  runtime: CurveRuntime,
  raw: unknown,
  sourcePackageVersion: string,
): Promise<Uint8Array> {
  const preprocess = parseFormattedPreprocessJson(raw);
  const points = recoverG1Points(runtime, preprocess.preprocess_entries_part1, preprocess.preprocess_entries_part2, 3);

  return createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.VerifierPreprocess,
    sourcePackageVersion,
    sections: [
      {
        type: BinarySectionType.Preprocess,
        encoding: BinarySectionEncoding.FfjsG1Affine96,
        label: "preprocess.g1",
        elementCount: 3,
        elementByteLength: 96,
        data: concatBytes(points),
      },
    ],
  });
}

function parseFormattedPreprocessJson(raw: unknown): FormattedPreprocessJson {
  if (!isRecord(raw)) {
    throw new Error("Formatted preprocess JSON must be an object.");
  }

  return {
    preprocess_entries_part1: parseHexStringArray(raw.preprocess_entries_part1, "preprocess.preprocess_entries_part1"),
    preprocess_entries_part2: parseHexStringArray(raw.preprocess_entries_part2, "preprocess.preprocess_entries_part2"),
  };
}

function parseFormattedProofJson(raw: unknown): FormattedProofJson {
  if (!isRecord(raw)) {
    throw new Error("Formatted proof JSON must be an object.");
  }

  return {
    proof_entries_part1: parseHexStringArray(raw.proof_entries_part1, "proof.proof_entries_part1"),
    proof_entries_part2: parseHexStringArray(raw.proof_entries_part2, "proof.proof_entries_part2"),
  };
}

function recoverG1Points(
  runtime: CurveRuntime,
  part1: readonly string[],
  part2: readonly string[],
  count: number,
): Uint8Array[] {
  if (part1.length !== count * 2 || part2.length < count * 2) {
    throw new Error("Formatted G1 point parts do not match the expected count.");
  }

  const points: Uint8Array[] = [];
  for (let index = 0; index < count * 2; index += 2) {
    points.push(
      runtime.G1.parseAffine({
        x: joinG1Coordinate(part1[index], part2[index]),
        y: joinG1Coordinate(part1[index + 1], part2[index + 1]),
      }),
    );
  }

  return points;
}

function requireBinarySection(
  artifactFile: BinaryArtifactFileView,
  query: {
    readonly kind: BinaryArtifactFileKind;
    readonly type: BinarySectionType;
    readonly encoding: BinarySectionEncoding;
    readonly label: string;
    readonly elementCount: number;
    readonly elementByteLength: number;
  },
): BinarySectionView {
  if (artifactFile.kind !== query.kind) {
    throw new Error(`Binary artifact kind mismatch: expected ${query.kind}, got ${artifactFile.kind}.`);
  }

  const section = artifactFile.sections.find(
    (candidate) =>
      candidate.type === query.type &&
      candidate.encoding === query.encoding &&
      candidate.label === query.label,
  );

  if (section === undefined) {
    throw new Error(`Missing binary artifact section '${query.label}'.`);
  }

  if (section.elementCount !== query.elementCount || section.elementByteLength !== query.elementByteLength) {
    throw new Error(`Binary artifact section '${query.label}' shape mismatch.`);
  }

  return section;
}

function appendSplitG1Coordinate(part1: string[], part2: string[], coordinate: string): void {
  const padded = stripHex(coordinate).padStart(96, "0");
  part1.push(`0x${padded.slice(0, 32)}`);
  part2.push(`0x${padded.slice(32)}`);
}

function joinG1Coordinate(part1: string, part2: string): string {
  return `0x${stripHex(part1).padStart(32, "0")}${stripHex(part2).padStart(64, "0")}`;
}
