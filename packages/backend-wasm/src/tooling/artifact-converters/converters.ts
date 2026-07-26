import { createBinaryArtifactFile, decodeBinaryArtifactFile } from "../../artifacts/format/binary-artifact-file.js";
import { GENERATED_PROVER_SETUP_PARAMS } from "../../prover/generated/subcircuit-library.generated.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../prover/internal/version.js";
import {
  BinaryArtifactFileKind,
  type BinaryArtifactFileView,
  BinarySectionEncoding,
  BinarySectionType,
  type BinarySectionView,
} from "../../artifacts/format/binary-format.js";
import { createCurveRuntime, type CurveRuntime } from "../../runtime/curve/curve.js";
import type {
  BinaryArtifactInspection,
  BinaryDigestInspection,
  BinaryInspectionOptions,
  ConverterArtifactJson,
  ConvertProofBinaryInput,
  ConvertProofInput,
  ConvertProofJsonInput,
} from "./types.js";
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

export async function convertInstance(instance: unknown): Promise<Uint8Array> {
  const runtime = await createCurveRuntime();
  try {
    return createProverInstanceArtifact(runtime, instance, BACKEND_WASM_PACKAGE_VERSION);
  } finally {
    await runtime.terminate();
  }
}

export async function convertWitness(witness: unknown): Promise<Uint8Array> {
  const runtime = await createCurveRuntime();
  try {
    return createProverPlacementVariablesArtifact(runtime, witness, BACKEND_WASM_PACKAGE_VERSION);
  } finally {
    await runtime.terminate();
  }
}

export async function convertPermutation(permutation: unknown): Promise<Uint8Array> {
  const entries = parseNativePermutationJson(permutation);

  return createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.ProverPermutation,
    sourcePackageVersion: BACKEND_WASM_PACKAGE_VERSION,
    sections: [
      {
        type: BinarySectionType.Permutation,
        encoding: BinarySectionEncoding.Bytes,
        label: "permutation.entries",
        elementCount: entries.length,
        elementByteLength: 16,
        data: encodePermutationEntries(entries),
      },
    ],
  });
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

export async function inspectBinary(
  artifact: Uint8Array,
  options: BinaryInspectionOptions = {},
): Promise<BinaryArtifactInspection> {
  const artifactFile = await decodeBinaryArtifactFile(artifact);

  return {
    kind: artifactFile.kind,
    formatVersion: artifactFile.formatVersion,
    sourcePackageVersion: artifactFile.sourcePackageVersion,
    byteLength: artifactFile.byteLength,
    digests: artifactFile.digests.map((entry): BinaryDigestInspection => ({
      type: entry.type,
      sectionIndex: entry.sectionIndex,
      digestHex: bytesToHex(entry.digest),
    })),
    sections: artifactFile.sections.map((section) => ({
      type: section.type,
      encoding: section.encoding,
      label: section.label,
      elementCount: section.elementCount,
      elementByteLength: section.elementByteLength,
      byteOffset: section.byteOffset,
      byteLength: section.byteLength,
      flags: section.flags,
      digestHex: bytesToHex(section.digest),
      dataHex: options.includeSectionData === true ? bytesToHex(section.data) : undefined,
    })),
  };
}

interface VerifierSetupParamsJson {
  readonly l_free: number;
  readonly l_user: number;
}

interface VerifierInstanceJson {
  readonly a_pub_user: readonly string[];
  readonly a_pub_block: readonly string[];
}

interface NativePlacementVariablesJson {
  readonly subcircuitId: number;
  readonly variables: readonly string[];
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

async function createProverPlacementVariablesArtifact(
  runtime: CurveRuntime,
  raw: unknown,
  sourcePackageVersion: string,
): Promise<Uint8Array> {
  const placementVariables = parseNativePlacementVariablesJson(raw);
  const variableOffsets = placementVariableOffsets(placementVariables);
  const variables = placementVariables.flatMap((placement) =>
    placement.variables.map((value) => runtime.Fr.fromHex(value)),
  );

  return createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.ProverPlacementVariables,
    sourcePackageVersion,
    sections: [
      {
        type: BinarySectionType.Placement,
        encoding: BinarySectionEncoding.Bytes,
        label: "placement.subcircuit_ids",
        elementCount: placementVariables.length,
        elementByteLength: 4,
        data: encodeU32List(placementVariables.map((placement) => placement.subcircuitId)),
      },
      {
        type: BinarySectionType.Placement,
        encoding: BinarySectionEncoding.Bytes,
        label: "placement.variable_offsets",
        elementCount: variableOffsets.length,
        elementByteLength: 4,
        data: encodeU32List(variableOffsets),
      },
      {
        type: BinarySectionType.Placement,
        encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
        label: "placement.variables",
        elementCount: variables.length,
        elementByteLength: runtime.Fr.byteLength,
        data: concatBytes(variables),
      },
    ],
  });
}

async function createProverInstanceArtifact(
  runtime: CurveRuntime,
  raw: unknown,
  sourcePackageVersion: string,
): Promise<Uint8Array> {
  const publicInstance = readPublicInstance(runtime, raw, GENERATED_PROVER_SETUP_PARAMS);

  return createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.ProverInstance,
    sourcePackageVersion,
    sections: [
      {
        type: BinarySectionType.Instance,
        encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
        label: "instance.public",
        elementCount: publicInstance.length,
        elementByteLength: runtime.Fr.byteLength,
        data: concatBytes(publicInstance),
      },
    ],
  });
}

function readPublicInstance(
  runtime: CurveRuntime,
  raw: unknown,
  setup: VerifierSetupParamsJson,
): readonly Uint8Array[] {
  const instance = parseVerifierInstanceJson(raw);
  const publicInstance = [
    ...instance.a_pub_user.slice(0, setup.l_user),
    ...instance.a_pub_block.slice(0, setup.l_free - setup.l_user),
  ];

  if (publicInstance.length !== setup.l_free) {
    throw new Error("Verifier public instance length does not match setupParams.l_free.");
  }

  return publicInstance.map((value) => runtime.Fr.fromHex(value));
}

function parseNativePlacementVariablesJson(raw: unknown): readonly NativePlacementVariablesJson[] {
  if (!Array.isArray(raw)) {
    throw new Error("Native placementVariables JSON must be an array.");
  }

  return raw.map((entry, index): NativePlacementVariablesJson => {
    if (!isRecord(entry)) {
      throw new Error(`Native placementVariables entry ${index} must be an object.`);
    }

    return {
      subcircuitId: parseU32(entry.subcircuitId, `placementVariables[${index}].subcircuitId`),
      variables: parseHexStringArray(entry.variables, `placementVariables[${index}].variables`),
    };
  });
}

function placementVariableOffsets(placementVariables: readonly NativePlacementVariablesJson[]): number[] {
  const offsets = [0];

  for (const placement of placementVariables) {
    offsets.push(offsets[offsets.length - 1] + placement.variables.length);
  }

  return offsets;
}

function parseVerifierInstanceJson(raw: unknown): VerifierInstanceJson {
  if (!isRecord(raw)) {
    throw new Error("Verifier instance JSON must be an object.");
  }

  return {
    a_pub_user: parseHexStringArray(raw.a_pub_user, "instance.a_pub_user"),
    a_pub_block: parseHexStringArray(raw.a_pub_block, "instance.a_pub_block"),
  };
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

function encodeU32List(values: readonly number[]): Uint8Array {
  const output = new Uint8Array(values.length * 4);
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  for (let index = 0; index < values.length; index += 1) {
    view.setUint32(index * 4, values[index], true);
  }

  return output;
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

function parseHexStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value.map((entry, index) => parseHexString(entry, `${label}[${index}]`));
}

function parseHexString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a hexadecimal string.`);
  }

  stripHex(value);
  return value;
}

function stripHex(value: string): string {
  if (!/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new Error("Expected a 0x-prefixed hexadecimal string.");
  }

  return value.slice(2);
}

interface NativePermutationEntry {
  readonly row: number;
  readonly col: number;
  readonly X: number;
  readonly Y: number;
}

function parseNativePermutationJson(raw: unknown): readonly NativePermutationEntry[] {
  if (!Array.isArray(raw)) {
    throw new Error("Native permutation JSON must be an array.");
  }

  return raw.map((entry, index): NativePermutationEntry => {
    if (!isRecord(entry)) {
      throw new Error(`Native permutation entry ${index} must be an object.`);
    }

    return {
      row: parseU32(entry.row, `permutation[${index}].row`),
      col: parseU32(entry.col, `permutation[${index}].col`),
      X: parseU32(entry.X, `permutation[${index}].X`),
      Y: parseU32(entry.Y, `permutation[${index}].Y`),
    };
  });
}

function encodePermutationEntries(entries: readonly NativePermutationEntry[]): Uint8Array {
  const output = new Uint8Array(entries.length * 16);
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);

  for (let index = 0; index < entries.length; index += 1) {
    const offset = index * 16;
    const entry = entries[index];
    view.setUint32(offset, entry.row, true);
    view.setUint32(offset + 4, entry.col, true);
    view.setUint32(offset + 8, entry.X, true);
    view.setUint32(offset + 12, entry.Y, true);
  }

  return output;
}

function parseU32(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`${label} must be an unsigned 32-bit integer.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}
