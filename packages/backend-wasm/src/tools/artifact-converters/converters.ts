import { createBinaryArtifactFile, decodeBinaryArtifactFile } from "../../libs/serialization/binary-artifact-file.js";
import { GENERATED_PROVER_SETUP_PARAMS } from "../../prover/generated/subcircuit-library.generated.js";
import {
  RuntimeArtifactBundleKind,
  RuntimeArtifactFileRole,
  type RuntimeArtifactBundleManifest,
} from "../../libs/serialization/artifact-bundle.js";
import {
  BinaryArtifactFileKind,
  type BinaryArtifactFileView,
  BinarySectionEncoding,
  BinarySectionType,
  type BinarySectionView,
} from "../../libs/serialization/binary-format.js";
import { createCurveRuntime, type CurveRuntime } from "../../libs/runtime/curve.js";
import type { AffinePointJson } from "../../libs/runtime/group.js";
import type {
  ArtifactConverterCommand,
  ArtifactConverterOutput,
  ArtifactConverterRequest,
  BinaryArtifactFileDebugJson,
  BinaryArtifactFileToDebugJsonInput,
  BinaryDigestDebugJson,
  ConverterArtifactJson,
  NativeProverArtifactsToBinaryInput,
  NativePermutationJsonToBinaryInput,
  NativeVerifierJsonToBinaryInput,
  ProofBinaryToNativeJsonInput,
  RuntimeArtifactBundleOutput,
  RuntimeArtifactBundleSetOutput,
} from "./types.js";
import { ARTIFACT_CONVERTER_COMMANDS } from "./types.js";

export { ARTIFACT_CONVERTER_COMMANDS };
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
    const crsBytes = await createVerifierCrsArtifact(runtime, artifacts.sigmaVerify, sourcePackageVersion);
    const preprocessBytes = await createVerifierPreprocessArtifact(
      runtime,
      setup,
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
            { role: RuntimeArtifactFileRole.Crs, path: "verifier-setup-input/crs.bin" },
            { role: RuntimeArtifactFileRole.Preprocess, path: "verifier-setup-input/preprocess.bin" },
          ]),
          files: [
            { path: "verifier-setup-input/crs.bin", bytes: crsBytes },
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
  if (input.rkyvArtifacts !== undefined && input.rkyvArtifacts.length > 0) {
    throw new Error(
      "Native prover rkyv CRS conversion is not implemented. Add a web-compatible rkyv decoder or provide an already decoded prover CRS object before using json-rkyv-to-prover-binary.",
    );
  }

  throw converterNotImplemented("json-rkyv-to-prover-binary");
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

function converterNotImplemented(command: ArtifactConverterCommand): Error {
  return new Error(`Artifact converter '${command}' is defined but not implemented in this milestone.`);
}

interface VerifierArtifacts {
  readonly setupParams: unknown;
  readonly proof: unknown;
  readonly preprocess: unknown;
  readonly instance: unknown;
  readonly sigmaVerify: unknown;
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

interface FormattedPreprocessJson {
  readonly preprocess_entries_part1: readonly string[];
  readonly preprocess_entries_part2: readonly string[];
}

interface FormattedProofJson {
  readonly proof_entries_part1: readonly string[];
  readonly proof_entries_part2: readonly string[];
}

interface SigmaVerifyJson {
  readonly G: AffinePointJson;
  readonly H: AffinePointJson;
  readonly sigma_1: {
    readonly x: AffinePointJson;
    readonly y: AffinePointJson;
  };
  readonly sigma_2: {
    readonly alpha: AffinePointJson;
    readonly alpha2: AffinePointJson;
    readonly alpha3: AffinePointJson;
    readonly alpha4: AffinePointJson;
    readonly gamma: AffinePointJson;
    readonly delta: AffinePointJson;
    readonly eta: AffinePointJson;
    readonly x: AffinePointJson;
    readonly y: AffinePointJson;
  };
  readonly lagrange_KL: AffinePointJson;
}

function normalizeVerifierArtifacts(input: NativeVerifierJsonToBinaryInput): VerifierArtifacts {
  return {
    setupParams: resolveVerifierSetupParams(input),
    proof: requireDefined(input.proof ?? input.artifacts?.proof, "verifier proof"),
    preprocess: requireDefined(input.preprocess ?? input.artifacts?.preprocess, "verifier preprocess"),
    instance: requireDefined(input.instance ?? input.artifacts?.instance, "verifier instance"),
    sigmaVerify: requireDefined(input.sigmaVerify ?? input.artifacts?.sigmaVerify, "verifier sigmaVerify"),
  };
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

async function createVerifierCrsArtifact(
  runtime: CurveRuntime,
  raw: unknown,
  sourcePackageVersion: string,
): Promise<Uint8Array> {
  const sigma = parseSigmaVerifyJson(raw);

  return createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.VerifierCrs,
    sourcePackageVersion,
    sections: [
      {
        type: BinarySectionType.CrsG1,
        encoding: BinarySectionEncoding.FfjsG1Affine96,
        label: "sigma.g1",
        elementCount: 4,
        elementByteLength: 96,
        data: concatBytes([
          runtime.G1.parseAffine(sigma.G),
          runtime.G1.parseAffine(sigma.sigma_1.x),
          runtime.G1.parseAffine(sigma.sigma_1.y),
          runtime.G1.parseAffine(sigma.lagrange_KL),
        ]),
      },
      {
        type: BinarySectionType.CrsG2,
        encoding: BinarySectionEncoding.FfjsG2Affine192,
        label: "sigma.g2",
        elementCount: 10,
        elementByteLength: 192,
        data: concatBytes([
          runtime.G2.parseAffine(sigma.H),
          runtime.G2.parseAffine(sigma.sigma_2.alpha),
          runtime.G2.parseAffine(sigma.sigma_2.alpha2),
          runtime.G2.parseAffine(sigma.sigma_2.alpha3),
          runtime.G2.parseAffine(sigma.sigma_2.alpha4),
          runtime.G2.parseAffine(sigma.sigma_2.gamma),
          runtime.G2.parseAffine(sigma.sigma_2.delta),
          runtime.G2.parseAffine(sigma.sigma_2.eta),
          runtime.G2.parseAffine(sigma.sigma_2.x),
          runtime.G2.parseAffine(sigma.sigma_2.y),
        ]),
      },
    ],
  });
}

async function createVerifierPreprocessArtifact(
  runtime: CurveRuntime,
  setup: VerifierSetupParamsJson,
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
        type: BinarySectionType.SetupParams,
        encoding: BinarySectionEncoding.Bytes,
        label: "setup.params",
        elementCount: 1,
        elementByteLength: 36,
        data: encodeSetupParams(setup),
      },
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

function parseSigmaVerifyJson(raw: unknown): SigmaVerifyJson {
  if (!isRecord(raw)) {
    throw new Error("Sigma verify JSON must be an object.");
  }

  const sigma1 = requireRecord(raw.sigma_1, "sigma_1");
  const sigma2 = requireRecord(raw.sigma_2, "sigma_2");

  return {
    G: parseAffinePointJson(raw.G, "G"),
    H: parseAffinePointJson(raw.H, "H"),
    sigma_1: {
      x: parseAffinePointJson(sigma1.x, "sigma_1.x"),
      y: parseAffinePointJson(sigma1.y, "sigma_1.y"),
    },
    sigma_2: {
      alpha: parseAffinePointJson(sigma2.alpha, "sigma_2.alpha"),
      alpha2: parseAffinePointJson(sigma2.alpha2, "sigma_2.alpha2"),
      alpha3: parseAffinePointJson(sigma2.alpha3, "sigma_2.alpha3"),
      alpha4: parseAffinePointJson(sigma2.alpha4, "sigma_2.alpha4"),
      gamma: parseAffinePointJson(sigma2.gamma, "sigma_2.gamma"),
      delta: parseAffinePointJson(sigma2.delta, "sigma_2.delta"),
      eta: parseAffinePointJson(sigma2.eta, "sigma_2.eta"),
      x: parseAffinePointJson(sigma2.x, "sigma_2.x"),
      y: parseAffinePointJson(sigma2.y, "sigma_2.y"),
    },
    lagrange_KL: parseAffinePointJson(raw.lagrange_KL, "lagrange_KL"),
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

function encodeSetupParams(setup: VerifierSetupParamsJson): Uint8Array {
  return encodeU32List([
    setup.l_free,
    setup.l_user_out,
    setup.l_user,
    setup.l,
    setup.l_D,
    setup.m_D,
    setup.n,
    setup.s_D,
    setup.s_max,
  ]);
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

function parseAffinePointJson(raw: unknown, label: string): AffinePointJson {
  if (!isRecord(raw)) {
    throw new Error(`${label} must be an affine point object.`);
  }

  return {
    x: parseHexString(raw.x, `${label}.x`),
    y: parseHexString(raw.y, `${label}.y`),
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value;
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
