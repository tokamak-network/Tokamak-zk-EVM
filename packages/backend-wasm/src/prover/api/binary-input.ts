import { loadRuntimeArtifactFile, requireRuntimeSection } from "../../artifacts/loaders/loaders.js";
import { loadProverCrsArtifact } from "../../artifacts/loaders/prepared-data.js";
import type { RuntimeArtifactFile } from "../../artifacts/loaders/types.js";
import type { CurveRuntime } from "../../core/curve/curve.js";
import type { FieldElement } from "../../core/field/field.js";
import {
  RuntimeArtifactFileRole,
  type RuntimeArtifactBundleFile,
  type RuntimeArtifactBundleManifest,
} from "../../artifacts/bundles/artifact-bundle.js";
import { BinarySectionEncoding, BinarySectionType } from "../../artifacts/format/binary-format.js";
import {
  GENERATED_PROVER_SETUP_PARAMS,
  GENERATED_PROVER_SPARSE_R1CS,
  GENERATED_PROVER_SUBCIRCUIT_INFOS,
  NATIVE_BACKEND_VERSION,
  SUBCIRCUIT_LIBRARY_PACKAGE_VERSION,
} from "../generated/subcircuit-library.generated.js";
import type {
  ProverPermutationEntry,
  ProverPlacementVariables,
  ProverSetupParams,
  ProverWitnessInput,
} from "../internal/witness.js";

export interface ProverRuntimeArtifactFiles {
  readonly placementVariables: RuntimeArtifactFile;
  readonly permutation: RuntimeArtifactFile;
  readonly instance: RuntimeArtifactFile;
  readonly crs: RuntimeArtifactFile;
}

export interface ProverProofWitnessRuntimeArtifactFiles {
  readonly placementVariables: RuntimeArtifactFile;
  readonly permutation: RuntimeArtifactFile;
  readonly instance: RuntimeArtifactFile;
}

export interface ProverCrsPreparedDataRuntimeArtifactFiles {
  readonly crs: RuntimeArtifactFile;
}

export type ProverWitnessRuntimeArtifactFiles = ProverProofWitnessRuntimeArtifactFiles;

export interface ProverRuntimeWitnessInputParts {
  readonly setup: ProverSetupParams;
  readonly placementVariables: readonly ProverPlacementVariables[];
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

export type ProverRuntimeArtifactFileResolver = (path: string) => Uint8Array | Promise<Uint8Array>;

export { NATIVE_BACKEND_VERSION, SUBCIRCUIT_LIBRARY_PACKAGE_VERSION };

export async function loadProverInputFromRuntimeBundles(
  runtime: CurveRuntime,
  proofWitnessInput: RuntimeArtifactBundleManifest,
  crsPreparedDataInput: RuntimeArtifactBundleManifest,
  resolveFile: ProverRuntimeArtifactFileResolver,
): Promise<ProverRuntimeInput> {
  const artifacts: ProverRuntimeArtifactFiles = {
    placementVariables: await loadBundleArtifactFile(
      proofWitnessInput,
      RuntimeArtifactFileRole.PlacementVariables,
      resolveFile,
    ),
    permutation: await loadBundleArtifactFile(
      proofWitnessInput,
      RuntimeArtifactFileRole.Permutation,
      resolveFile,
    ),
    instance: await loadBundleArtifactFile(
      proofWitnessInput,
      RuntimeArtifactFileRole.Instance,
      resolveFile,
    ),
    crs: await loadBundleArtifactFile(
      crsPreparedDataInput,
      RuntimeArtifactFileRole.Crs,
      resolveFile,
    ),
  };

  return buildProverInputFromRuntimeArtifacts(runtime, artifacts);
}

export function buildProverInputFromRuntimeArtifacts(
  runtime: CurveRuntime,
  artifacts: ProverRuntimeArtifactFiles,
): ProverRuntimeInput {
  const parts = loadProverRuntimeWitnessInputParts(runtime, artifacts);

  return {
    witness: {
      setup: parts.setup,
      placementVariables: parts.placementVariables,
      subcircuitInfos: GENERATED_PROVER_SUBCIRCUIT_INFOS,
      r1csBySubcircuit: GENERATED_PROVER_SPARSE_R1CS,
    },
    permutation: parts.permutation,
    publicInstance: parts.publicInstance,
    crs: parseProverCrs(artifacts.crs),
  };
}

export function loadProverRuntimeWitnessInputParts(
  runtime: CurveRuntime,
  artifacts: ProverWitnessRuntimeArtifactFiles,
): ProverRuntimeWitnessInputParts {
  return {
    setup: GENERATED_PROVER_SETUP_PARAMS,
    placementVariables: parseProverPlacementVariables(runtime, artifacts.placementVariables),
    permutation: parseProverPermutation(artifacts.permutation),
    publicInstance: parseProverPublicInstance(runtime, artifacts.instance),
  };
}

export function buildProverWitnessInputFromRuntimeArtifacts(
  runtime: CurveRuntime,
  artifacts: ProverWitnessRuntimeArtifactFiles,
): ProverWitnessInput {
  const parts = loadProverRuntimeWitnessInputParts(runtime, artifacts);

  return {
    setup: parts.setup,
    placementVariables: parts.placementVariables,
    subcircuitInfos: GENERATED_PROVER_SUBCIRCUIT_INFOS,
    r1csBySubcircuit: GENERATED_PROVER_SPARSE_R1CS,
  };
}

async function loadBundleArtifactFile(
  manifest: RuntimeArtifactBundleManifest,
  role: RuntimeArtifactFileRole,
  resolveFile: ProverRuntimeArtifactFileResolver,
): Promise<RuntimeArtifactFile> {
  const file = requireSingleRoleFile(manifest, role);
  return loadRuntimeArtifactFile(await resolveFile(file.path));
}

function requireSingleRoleFile(
  manifest: RuntimeArtifactBundleManifest,
  role: RuntimeArtifactFileRole,
): RuntimeArtifactBundleFile {
  const matches = manifest.files.filter((file) => file.role === role);
  if (matches.length !== 1) {
    throw new Error(`${manifest.kind} bundle must contain exactly one '${role}' artifact file.`);
  }

  return matches[0];
}

export function parseProverPlacementVariables(
  runtime: CurveRuntime,
  placementFile: RuntimeArtifactFile,
): readonly ProverPlacementVariables[] {
  const idsSection = requireRuntimeSection(placementFile, {
    type: BinarySectionType.Placement,
    encoding: BinarySectionEncoding.Bytes,
    label: "placement.subcircuit_ids",
  });
  const offsetsSection = requireRuntimeSection(placementFile, {
    type: BinarySectionType.Placement,
    encoding: BinarySectionEncoding.Bytes,
    label: "placement.variable_offsets",
  });
  const variablesSection = requireRuntimeSection(placementFile, {
    type: BinarySectionType.Placement,
    encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
    label: "placement.variables",
  });
  const subcircuitIds = readU32List(idsSection.data, "placement.subcircuit_ids");
  const variableOffsets = readU32List(offsetsSection.data, "placement.variable_offsets");
  const variables = splitFieldElements(runtime, variablesSection.data, "placement.variables");

  if (variableOffsets.length !== subcircuitIds.length + 1) {
    throw new Error("placement.variable_offsets length must be placement.subcircuit_ids length plus one.");
  }

  if (variableOffsets[0] !== 0) {
    throw new Error("placement.variable_offsets must start at zero.");
  }

  if (variableOffsets[variableOffsets.length - 1] !== variables.length) {
    throw new Error("placement.variable_offsets final value must equal placement.variables element count.");
  }

  return subcircuitIds.map((subcircuitId, index): ProverPlacementVariables => {
    const start = variableOffsets[index];
    const end = variableOffsets[index + 1];
    if (end < start) {
      throw new Error(`placement.variable_offsets must be monotonic at index ${index}.`);
    }

    return {
      subcircuitId,
      variables: variables.slice(start, end),
    };
  });
}

export function parseProverPublicInstance(
  runtime: CurveRuntime,
  instanceFile: RuntimeArtifactFile,
): readonly FieldElement[] {
  const section = requireRuntimeSection(instanceFile, {
    type: BinarySectionType.Instance,
    encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
    label: "instance.public",
  });

  return splitFieldElements(runtime, section.data, "instance.public");
}

export function parseProverPermutation(permutationFile: RuntimeArtifactFile): readonly ProverPermutationEntry[] {
  const section = requireRuntimeSection(permutationFile, {
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

export function parseProverCrs(crsFile: RuntimeArtifactFile): ProverCrsRuntime {
  const fixedPoints = loadProverCrsArtifact(crsFile).pointsByName;

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

function readU32List(data: Uint8Array, label: string): number[] {
  if (data.byteLength % 4 !== 0) {
    throw new Error(`${label} byte length must be divisible by 4.`);
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const output: number[] = [];
  for (let offset = 0; offset < data.byteLength; offset += 4) {
    output.push(view.getUint32(offset, true));
  }

  return output;
}

function describeG1Section(artifactFile: RuntimeArtifactFile, label: string): ProverCrsG1Section {
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

function requireG1Section(artifactFile: RuntimeArtifactFile, label: string) {
  return requireRuntimeSection(artifactFile, {
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
