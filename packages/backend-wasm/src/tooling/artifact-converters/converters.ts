import { createBinaryArtifactFile, decodeBinaryArtifactFile } from "../../artifacts/format/binary-artifact-file.js";
import { GENERATED_PROVER_SETUP_PARAMS } from "../../prover/generated/subcircuit-library.generated.js";
import {
  RuntimeArtifactBundleKind,
  RuntimeArtifactFileRole,
  type RuntimeArtifactBundleManifest,
} from "../../artifacts/bundles/artifact-bundle.js";
import {
  BinaryArtifactFileKind,
  type BinaryArtifactFileView,
  BinarySectionEncoding,
  BinarySectionType,
  type BinarySectionView,
} from "../../artifacts/format/binary-format.js";
import { createCurveRuntime, type CurveRuntime } from "../../core/curve/curve.js";
import type {
  ArtifactConverterCommand,
  ArtifactConverterOutput,
  ArtifactConverterRequest,
  BinaryArtifactFileDebugJson,
  BinaryArtifactFileToDebugJsonInput,
  BinaryDigestDebugJson,
  ConverterArtifactJson,
  NativeProverArtifactsToBinaryInput,
  NativeProverRkyvArtifacts,
  NativePermutationJsonToBinaryInput,
  NativeVerifierJsonToBinaryInput,
  ProofBinaryToNativeJsonInput,
  RuntimeArtifactBundleOutput,
  RuntimeArtifactBundleSetOutput,
} from "./types.js";
import { ARTIFACT_CONVERTER_COMMANDS } from "./types.js";
import {
  convertCombinedSigmaRkyvToProverCrsBinary,
  createCombinedSigmaRkyvPayloadDecoder,
  createUnavailableRkyvArchiveDecoder,
  decodeCombinedSigmaRkyvPayload,
} from "./rkyv-to-binary.js";

export { ARTIFACT_CONVERTER_COMMANDS };
export {
  convertCombinedSigmaRkyvToProverCrsBinary,
  createCombinedSigmaRkyvPayloadDecoder,
  createUnavailableRkyvArchiveDecoder,
  decodeCombinedSigmaRkyvPayload,
};
export type { DecodedCombinedSigmaRkyv, RkyvArchiveDecoder, RkyvToBinaryConverterOptions } from "./rkyv-to-binary.js";
export type {
  ArtifactConverterCommand,
  ArtifactConverterInput,
  ArtifactConverterOutput,
  ArtifactConverterRequest,
  BinaryArtifactFileDebugJson,
  BinaryArtifactFileToDebugJsonInput,
  BinaryDigestDebugJson,
  BinarySectionDebugJson,
  ConverterArtifactJson,
  NativeProverArtifactsToBinaryInput,
  NativeProverRkyvArtifacts,
  NativePermutationJsonToBinaryInput,
  NativeVerifierJsonToBinaryInput,
  ProofBinaryToNativeJsonInput,
  RuntimeArtifactBundleOutput,
  RuntimeArtifactBundleSetOutput,
  RuntimeArtifactBundleOutputFile,
} from "./types.js";

export function isArtifactConverterCommand(value: string): value is ArtifactConverterCommand {
  return ARTIFACT_CONVERTER_COMMANDS.includes(value as ArtifactConverterCommand);
}

export async function convertNativeVerifierJsonToBinary(
  input: NativeVerifierJsonToBinaryInput,
): Promise<RuntimeArtifactBundleSetOutput> {
  const sourcePackageVersion = requireSourcePackageVersion(input.sourcePackageVersion);
  const artifacts = normalizeVerifierArtifacts(input);
  const setup = parseSetupParams(artifacts.setupParams, "verifier setupParams");
  const runtime = await createCurveRuntime();

  try {
    const instanceBytes = await createBinaryArtifactFile({
      kind: BinaryArtifactFileKind.VerifierInstance,
      sourcePackageVersion,
      sections: [
        {
          type: BinarySectionType.Instance,
          encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
          label: "instance.public",
          elementCount: setup.l_free,
          elementByteLength: runtime.Fr.byteLength,
          data: concatBytes(readPublicInstance(runtime, artifacts.instance, setup)),
        },
      ],
    });
    const proofBytes = await createVerifierProofArtifact(runtime, artifacts.proof, sourcePackageVersion);
    const preprocessBytes = await createVerifierPreprocessArtifact(
      runtime,
      artifacts.preprocess,
      sourcePackageVersion,
    );

    return {
      bundles: [
        {
          manifest: createBundleManifest(RuntimeArtifactBundleKind.VerifierProofInput, [
            { role: RuntimeArtifactFileRole.Instance, path: "verifier-proof-input/instance.bin" },
            { role: RuntimeArtifactFileRole.Proof, path: "verifier-proof-input/proof.bin" },
          ]),
          files: [
            { path: "verifier-proof-input/instance.bin", bytes: instanceBytes },
            { path: "verifier-proof-input/proof.bin", bytes: proofBytes },
          ],
        },
        {
          manifest: createBundleManifest(RuntimeArtifactBundleKind.VerifierSetupInput, [
            { role: RuntimeArtifactFileRole.Preprocess, path: "verifier-setup-input/preprocess.bin" },
          ]),
          files: [
            { path: "verifier-setup-input/preprocess.bin", bytes: preprocessBytes },
          ],
        },
      ],
    };
  } finally {
    await runtime.terminate();
  }
}

export async function convertNativeProverArtifactsToBinary(
  input: NativeProverArtifactsToBinaryInput,
): Promise<RuntimeArtifactBundleSetOutput> {
  const sourcePackageVersion = requireSourcePackageVersion(input.sourcePackageVersion);
  const combinedSigma = readCombinedSigmaRkyvArtifact(input);

  if (combinedSigma === undefined) {
    throw new Error("json-rkyv-to-prover-binary requires rkyvArtifacts.combinedSigma or rkyvArtifacts[0].");
  }

  const crsBytes = await convertCombinedSigmaRkyvToProverCrsBinary(combinedSigma, {
    sourcePackageVersion,
    decoder: input.rkyvDecoder ?? createUnavailableRkyvArchiveDecoder(),
  });
  const proofWitnessBundle = await createProverProofWitnessBundle(input, sourcePackageVersion);

  return {
    bundles: [
      ...(proofWitnessBundle === undefined ? [] : [proofWitnessBundle]),
      {
        manifest: createBundleManifest(RuntimeArtifactBundleKind.ProverCrsPreparedData, [
          { role: RuntimeArtifactFileRole.Crs, path: "prover-crs-prepared-data/crs.bin" },
        ]),
        files: [
          { path: "prover-crs-prepared-data/crs.bin", bytes: crsBytes },
        ],
      },
    ],
  };
}

async function createProverProofWitnessBundle(
  input: NativeProverArtifactsToBinaryInput,
  sourcePackageVersion: string,
): Promise<RuntimeArtifactBundleOutput | undefined> {
  if (input.placement === undefined && input.permutation === undefined && input.instance === undefined) {
    return undefined;
  }

  const placement = requireDefined(input.placement, "prover placement variables");
  const permutation = requireDefined(input.permutation, "prover permutation");
  const instance = requireDefined(input.instance, "prover instance");
  const runtime = await createCurveRuntime();

  try {
    const placementBytes = await createProverPlacementVariablesArtifact(runtime, placement, sourcePackageVersion);
    const permutationBytes = await convertNativePermutationJsonToBinary({ permutation, sourcePackageVersion });
    const instanceBytes = await createProverInstanceArtifact(runtime, instance, sourcePackageVersion);

    return {
      manifest: createBundleManifest(RuntimeArtifactBundleKind.ProverProofWitnessInput, [
        { role: RuntimeArtifactFileRole.PlacementVariables, path: "prover-proof-witness-input/placement.bin" },
        { role: RuntimeArtifactFileRole.Permutation, path: "prover-proof-witness-input/permutation.bin" },
        { role: RuntimeArtifactFileRole.Instance, path: "prover-proof-witness-input/instance.bin" },
      ]),
      files: [
        { path: "prover-proof-witness-input/placement.bin", bytes: placementBytes },
        { path: "prover-proof-witness-input/permutation.bin", bytes: permutationBytes },
        { path: "prover-proof-witness-input/instance.bin", bytes: instanceBytes },
      ],
    };
  } finally {
    await runtime.terminate();
  }
}

export async function convertNativePermutationJsonToBinary(
  input: NativePermutationJsonToBinaryInput,
): Promise<Uint8Array> {
  const entries = parseNativePermutationJson(input.permutation);

  return createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.ProverPermutation,
    sourcePackageVersion: input.sourcePackageVersion,
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

export async function convertProofBinaryToNativeJson(
  input: ProofBinaryToNativeJsonInput,
): Promise<ConverterArtifactJson> {
  const artifactFile = await decodeBinaryArtifactFile(input.proofFile);
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

export async function convertBinaryArtifactFileToDebugJson(
  input: BinaryArtifactFileToDebugJsonInput,
): Promise<BinaryArtifactFileDebugJson> {
  const artifactFile = await decodeBinaryArtifactFile(input.artifactFile);

  return {
    kind: artifactFile.kind,
    formatVersion: artifactFile.formatVersion,
    sourcePackageVersion: artifactFile.sourcePackageVersion,
    byteLength: artifactFile.byteLength,
    digests: artifactFile.digests.map((entry): BinaryDigestDebugJson => ({
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
      dataHex: input.includeSectionData === true ? bytesToHex(section.data) : undefined,
    })),
  };
}

export async function executeArtifactConverter(
  request: ArtifactConverterRequest,
): Promise<ArtifactConverterOutput> {
  switch (request.command) {
    case "json-to-verifier-binary":
      return convertNativeVerifierJsonToBinary(request.input as NativeVerifierJsonToBinaryInput);
    case "json-rkyv-to-prover-binary":
      return convertNativeProverArtifactsToBinary(request.input as NativeProverArtifactsToBinaryInput);
    case "permutation-json-to-binary":
      return convertNativePermutationJsonToBinary(request.input as NativePermutationJsonToBinaryInput);
    case "proof-binary-to-json":
      return convertProofBinaryToNativeJson(request.input as ProofBinaryToNativeJsonInput);
    case "binary-to-debug-json":
      return convertBinaryArtifactFileToDebugJson(request.input as BinaryArtifactFileToDebugJsonInput);
  }
}

interface VerifierArtifacts {
  readonly setupParams: unknown;
  readonly proof: unknown;
  readonly preprocess: unknown;
  readonly instance: unknown;
}

interface VerifierSetupParamsJson {
  readonly l_free: number;
  readonly l_user_out: number;
  readonly l_user: number;
  readonly l: number;
  readonly l_D: number;
  readonly m_D: number;
  readonly n: number;
  readonly s_D: number;
  readonly s_max: number;
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

function normalizeVerifierArtifacts(input: NativeVerifierJsonToBinaryInput): VerifierArtifacts {
  return {
    setupParams: resolveVerifierSetupParams(input),
    proof: requireDefined(input.proof ?? input.artifacts?.proof, "verifier proof"),
    preprocess: requireDefined(input.preprocess ?? input.artifacts?.preprocess, "verifier preprocess"),
    instance: requireDefined(input.instance ?? input.artifacts?.instance, "verifier instance"),
  };
}

function readCombinedSigmaRkyvArtifact(input: NativeProverArtifactsToBinaryInput): Uint8Array | undefined {
  const artifacts = input.rkyvArtifacts;
  if (artifacts === undefined) {
    return undefined;
  }

  if (isNamedProverRkyvArtifacts(artifacts)) {
    return artifacts.combinedSigma;
  }

  return artifacts[0];
}

function isNamedProverRkyvArtifacts(value: NativeProverArtifactsToBinaryInput["rkyvArtifacts"]): value is NativeProverRkyvArtifacts {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveVerifierSetupParams(input: NativeVerifierJsonToBinaryInput): unknown {
  const explicit = input.setupParams ?? input.artifacts?.setupParams;
  if (explicit !== undefined) {
    return explicit;
  }

  if (input.useGeneratedSetupParams === true) {
    return GENERATED_PROVER_SETUP_PARAMS;
  }

  throw new Error(
    "Missing verifier setupParams. Pass setupParams explicitly, or set useGeneratedSetupParams=true to use the pinned subcircuit-library setup params.",
  );
}

function createBundleManifest(
  kind: RuntimeArtifactBundleKind,
  files: RuntimeArtifactBundleManifest["files"],
): RuntimeArtifactBundleManifest {
  return {
    schemaVersion: 1,
    kind,
    files,
  };
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

function parseSetupParams(raw: unknown, label: string): VerifierSetupParamsJson {
  if (!isRecord(raw)) {
    throw new Error(`${label} must be an object.`);
  }

  return {
    l_free: parseU32(raw.l_free, `${label}.l_free`),
    l_user_out: parseU32(raw.l_user_out, `${label}.l_user_out`),
    l_user: parseU32(raw.l_user, `${label}.l_user`),
    l: parseU32(raw.l, `${label}.l`),
    l_D: parseU32(raw.l_D, `${label}.l_D`),
    m_D: parseU32(raw.m_D, `${label}.m_D`),
    n: parseU32(raw.n, `${label}.n`),
    s_D: parseU32(raw.s_D, `${label}.s_D`),
    s_max: parseU32(raw.s_max, `${label}.s_max`),
  };
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

function requireDefined<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Missing ${label}.`);
  }

  return value;
}

function requireSourcePackageVersion(value: string | undefined): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Artifact converter input requires sourcePackageVersion.");
  }

  return value;
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
