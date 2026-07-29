import {
  decodeBinaryArtifactFile,
  requireBinaryArtifactSection,
} from "../../artifacts/binary/binary-artifact-file.js";
import type { BinaryArtifactFileView } from "../../artifacts/binary/binary-format.js";
import { loadNamedArtifactPoints } from "../../artifacts/specs/format-spec-loader.js";
import { PROVER_CRS_V1_SPEC } from "../../artifacts/specs/prover-crs.v1.generated.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import type { FieldElement } from "../../runtime/field/field-runtime.js";
import { BinarySectionEncoding, BinarySectionType } from "../../artifacts/binary/binary-format.js";
import type { SetupParams } from "../../artifacts/setup/setup-params.js";
import {
  GENERATED_PROVER_PACKED_R1CS,
  GENERATED_PROVER_SUBCIRCUIT_INFOS,
} from "../generated/subcircuit-library.generated.js";
import {
  GENERATED_SETUP_PARAMS,
  NATIVE_BACKEND_VERSION,
  SUBCIRCUIT_LIBRARY_PACKAGE_VERSION,
} from "../../generated/setup.generated.js";
import type {
  ProverPermutationEntry,
  ProverPlacementVariables,
  ProverWitnessInput,
} from "../protocol/witness.js";

export interface ProverBinaryArtifactFiles {
  readonly placementVariables: BinaryArtifactFileView;
  readonly permutation: BinaryArtifactFileView;
  readonly instance: BinaryArtifactFileView;
  readonly crs: BinaryArtifactFileView;
}

export interface ProverBinaryInput {
  readonly witness: Uint8Array;
  readonly permutation: Uint8Array;
  readonly instance: Uint8Array;
  readonly proverCrs: Uint8Array;
}

export interface ProverWitnessBinaryArtifactFiles {
  readonly placementVariables: BinaryArtifactFileView;
  readonly permutation: BinaryArtifactFileView;
  readonly instance: BinaryArtifactFileView;
}

export interface ProverRuntimeWitnessInputParts {
  readonly setup: SetupParams;
  readonly placementVariables: ProverPlacementVariables;
  readonly permutation: readonly ProverPermutationEntry[];
  readonly publicInstance: readonly FieldElement[];
}

export interface ProverCrsRuntime {
  readonly G: Uint8Array;
  readonly H: Uint8Array;
  readonly lagrangeKL: Uint8Array;
  readonly sigma1: ProverSigma1Runtime;
  readonly sigma2: ProverSigma2Runtime;
}

export interface ProverSigma1Runtime {
  readonly x: Uint8Array;
  readonly y: Uint8Array;
  readonly delta: Uint8Array;
  readonly eta: Uint8Array;
  readonly xyPowers: ProverCrsG1Section;
  readonly gammaInvOInst: ProverCrsG1Section;
  readonly etaInvLiOInterAlpha4Kj: ProverCrsG1Section;
  readonly deltaInvLiOPrv: ProverCrsG1Section;
  readonly deltaInvAlphakXhTx: ProverCrsG1Section;
  readonly deltaInvAlpha4XjTx: ProverCrsG1Section;
  readonly deltaInvAlphakYiTy: ProverCrsG1Section;
}

export interface ProverCrsG1Section {
  readonly data: Uint8Array;
  readonly count: number;
  readonly elementByteLength: number;
}

export interface ProverSigma2Runtime {
  readonly alpha: Uint8Array;
  readonly alpha2: Uint8Array;
  readonly alpha3: Uint8Array;
  readonly alpha4: Uint8Array;
  readonly gamma: Uint8Array;
  readonly delta: Uint8Array;
  readonly eta: Uint8Array;
  readonly x: Uint8Array;
  readonly y: Uint8Array;
}

export interface ProverRuntimeInput {
  readonly witness: ProverWitnessInput;
  readonly permutation: readonly ProverPermutationEntry[];
  readonly publicInstance: readonly FieldElement[];
  readonly crs: ProverCrsRuntime;
}

export { NATIVE_BACKEND_VERSION, SUBCIRCUIT_LIBRARY_PACKAGE_VERSION };

export async function loadProverInputFromBinaryInput(
  runtime: CurveRuntime,
  input: ProverBinaryInput,
): Promise<ProverRuntimeInput> {
  const [placementVariables, permutation, instance, crs] = await Promise.all([
    decodeBinaryArtifactFile(input.witness),
    decodeBinaryArtifactFile(input.permutation),
    decodeBinaryArtifactFile(input.instance),
    decodeBinaryArtifactFile(input.proverCrs),
  ]);
  const artifacts: ProverBinaryArtifactFiles = {
    placementVariables,
    permutation,
    instance,
    crs,
  };

  return buildProverInputFromBinaryArtifacts(runtime, artifacts);
}

export function buildProverInputFromBinaryArtifacts(
  runtime: CurveRuntime,
  artifacts: ProverBinaryArtifactFiles,
): ProverRuntimeInput {
  const parts = loadProverRuntimeWitnessInputParts(runtime, artifacts);

  return {
    witness: {
      setup: parts.setup,
      placementVariables: parts.placementVariables,
      subcircuitInfos: GENERATED_PROVER_SUBCIRCUIT_INFOS,
      r1csBySubcircuit: GENERATED_PROVER_PACKED_R1CS,
    },
    permutation: parts.permutation,
    publicInstance: parts.publicInstance,
    crs: parseProverCrs(artifacts.crs),
  };
}

export function loadProverRuntimeWitnessInputParts(
  runtime: CurveRuntime,
  artifacts: ProverWitnessBinaryArtifactFiles,
): ProverRuntimeWitnessInputParts {
  return {
    setup: GENERATED_SETUP_PARAMS,
    placementVariables: parseProverPlacementVariables(runtime, artifacts.placementVariables),
    permutation: parseProverPermutation(artifacts.permutation),
    publicInstance: parseProverPublicInstance(runtime, artifacts.instance),
  };
}

export function parseProverPlacementVariables(
  runtime: CurveRuntime,
  placementFile: BinaryArtifactFileView,
): ProverPlacementVariables {
  const idsSection = requireBinaryArtifactSection(placementFile, {
    type: BinarySectionType.Placement,
    encoding: BinarySectionEncoding.Bytes,
    label: "placement.subcircuit_ids",
  });
  const offsetsSection = requireBinaryArtifactSection(placementFile, {
    type: BinarySectionType.Placement,
    encoding: BinarySectionEncoding.Bytes,
    label: "placement.variable_offsets",
  });
  const variablesSection = requireBinaryArtifactSection(placementFile, {
    type: BinarySectionType.Placement,
    encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
    label: "placement.variables",
  });
  const subcircuitIds = readU32Array(idsSection.data, "placement.subcircuit_ids");
  const variableOffsets = readU32Array(offsetsSection.data, "placement.variable_offsets");
  const variables = variablesSection.data;

  if (variables.byteLength % runtime.Fr.byteLength !== 0) {
    throw new Error("placement.variables byte length is not divisible by the field element width.");
  }

  if (variableOffsets.length !== subcircuitIds.length + 1) {
    throw new Error("placement.variable_offsets length must be placement.subcircuit_ids length plus one.");
  }

  if (variableOffsets[0] !== 0) {
    throw new Error("placement.variable_offsets must start at zero.");
  }

  if (variableOffsets[variableOffsets.length - 1] !== variables.byteLength / runtime.Fr.byteLength) {
    throw new Error("placement.variable_offsets final value must equal placement.variables element count.");
  }

  for (let index = 0; index < variableOffsets.length - 1; index += 1) {
    if (variableOffsets[index + 1] < variableOffsets[index]) {
      throw new Error(`placement.variable_offsets must be monotonic at index ${index}.`);
    }
  }

  return {
    subcircuitIds,
    variableOffsets,
    variables,
    fieldByteLength: runtime.Fr.byteLength,
  };
}

export function parseProverPublicInstance(
  runtime: CurveRuntime,
  instanceFile: BinaryArtifactFileView,
): readonly FieldElement[] {
  const section = requireBinaryArtifactSection(instanceFile, {
    type: BinarySectionType.Instance,
    encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
    label: "instance.public",
  });

  return splitFieldElements(runtime, section.data, "instance.public");
}

export function parseProverPermutation(permutationFile: BinaryArtifactFileView): readonly ProverPermutationEntry[] {
  const section = requireBinaryArtifactSection(permutationFile, {
    type: BinarySectionType.Permutation,
    encoding: BinarySectionEncoding.Bytes,
    label: "permutation.entries",
  });

  if (section.data.byteLength % 16 !== 0) {
    throw new Error("permutation.entries byte length must be divisible by 16.");
  }

  const view = new DataView(section.data.buffer, section.data.byteOffset, section.data.byteLength);
  const entries: ProverPermutationEntry[] = [];
  for (let offset = 0; offset < section.data.byteLength; offset += 16) {
    entries.push({
      row: view.getUint32(offset, true),
      col: view.getUint32(offset + 4, true),
      X: view.getUint32(offset + 8, true),
      Y: view.getUint32(offset + 12, true),
    });
  }

  return entries;
}

export function parseProverCrs(crsFile: BinaryArtifactFileView): ProverCrsRuntime {
  const fixedPoints = loadNamedArtifactPoints(crsFile, PROVER_CRS_V1_SPEC);

  return {
    G: requireEntry(fixedPoints, "G"),
    H: requireEntry(fixedPoints, "H"),
    lagrangeKL: requireEntry(fixedPoints, "lagrangeKL"),
    sigma1: {
      x: requireEntry(fixedPoints, "sigma1.x"),
      y: requireEntry(fixedPoints, "sigma1.y"),
      delta: requireEntry(fixedPoints, "sigma1.delta"),
      eta: requireEntry(fixedPoints, "sigma1.eta"),
      xyPowers: describeG1Section(crsFile, "sigma1.xy-powers"),
      gammaInvOInst: describeG1Section(crsFile, "sigma1.gamma-inv-o-inst"),
      etaInvLiOInterAlpha4Kj: describeG1Section(crsFile, "sigma1.eta-inv-li-o-inter-alpha4-kj"),
      deltaInvLiOPrv: describeG1Section(crsFile, "sigma1.delta-inv-li-o-prv"),
      deltaInvAlphakXhTx: describeG1Section(crsFile, "sigma1.delta-inv-alphak-xh-tx"),
      deltaInvAlpha4XjTx: describeG1Section(crsFile, "sigma1.delta-inv-alpha4-xj-tx"),
      deltaInvAlphakYiTy: describeG1Section(crsFile, "sigma1.delta-inv-alphak-yi-ty"),
    },
    sigma2: {
      alpha: requireEntry(fixedPoints, "sigma2.alpha"),
      alpha2: requireEntry(fixedPoints, "sigma2.alpha2"),
      alpha3: requireEntry(fixedPoints, "sigma2.alpha3"),
      alpha4: requireEntry(fixedPoints, "sigma2.alpha4"),
      gamma: requireEntry(fixedPoints, "sigma2.gamma"),
      delta: requireEntry(fixedPoints, "sigma2.delta"),
      eta: requireEntry(fixedPoints, "sigma2.eta"),
      x: requireEntry(fixedPoints, "sigma2.x"),
      y: requireEntry(fixedPoints, "sigma2.y"),
    },
  };
}

function readU32Array(data: Uint8Array, label: string): Uint32Array {
  if (data.byteLength % 4 !== 0) {
    throw new Error(`${label} byte length must be divisible by 4.`);
  }

  const output = new Uint32Array(data.byteLength / 4);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = view.getUint32(index * 4, true);
  }

  return output;
}

function describeG1Section(artifactFile: BinaryArtifactFileView, label: string): ProverCrsG1Section {
  const section = requireG1Section(artifactFile, label);
  if (section.data.byteLength % section.elementByteLength !== 0) {
    throw new Error(`${label} section byte length is not divisible by its point width.`);
  }

  return {
    data: section.data,
    count: section.data.byteLength / section.elementByteLength,
    elementByteLength: section.elementByteLength,
  };
}

function requireG1Section(artifactFile: BinaryArtifactFileView, label: string) {
  return requireBinaryArtifactSection(artifactFile, {
    type: BinarySectionType.CrsG1,
    encoding: BinarySectionEncoding.FfjsG1Affine96,
    label,
  });
}

function splitFieldElements(runtime: CurveRuntime, data: Uint8Array, label: string): FieldElement[] {
  if (data.byteLength % runtime.Fr.byteLength !== 0) {
    throw new Error(`${label} byte length is not divisible by the field element width.`);
  }

  const output: FieldElement[] = [];
  for (let offset = 0; offset < data.byteLength; offset += runtime.Fr.byteLength) {
    output.push(data.subarray(offset, offset + runtime.Fr.byteLength));
  }

  return output;
}

function requireEntry(entries: Readonly<Record<string, Uint8Array>>, name: string): Uint8Array {
  const entry = entries[name];
  if (entry === undefined) {
    throw new Error(`Missing prover CRS entry '${name}'.`);
  }

  return entry;
}

export function proverCrsG1PointAt(section: ProverCrsG1Section, index: number): Uint8Array {
  if (!Number.isSafeInteger(index) || index < 0 || index >= section.count) {
    throw new Error(`Prover CRS G1 point index ${index} is out of range.`);
  }

  const offset = index * section.elementByteLength;
  return section.data.subarray(offset, offset + section.elementByteLength);
}

export function proverCrsG1PointRange(
  section: ProverCrsG1Section,
  start: number,
  count: number,
): Uint8Array {
  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(count)
    || start < 0
    || count < 0
    || start + count > section.count
  ) {
    throw new Error(`Prover CRS G1 point range [${start}, ${start + count}) is out of range.`);
  }

  const byteStart = start * section.elementByteLength;
  return section.data.subarray(byteStart, byteStart + count * section.elementByteLength);
}
