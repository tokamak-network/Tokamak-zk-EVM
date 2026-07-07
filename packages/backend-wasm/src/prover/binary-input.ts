import { loadRuntimeArtifactFile, requireRuntimeSection } from "../libs/artifact-loaders/loaders.js";
import { loadProverCrsArtifact } from "../libs/artifact-loaders/prepared-data.js";
import type { RuntimeArtifactFile } from "../libs/artifact-loaders/types.js";
import type { CurveRuntime } from "../libs/runtime/curve.js";
import type { FieldElement } from "../libs/runtime/field.js";
import {
  RuntimeArtifactFileRole,
  type RuntimeArtifactBundleFile,
  type RuntimeArtifactBundleManifest,
} from "../libs/serialization/artifact-bundle.js";
import { BinarySectionEncoding, BinarySectionType } from "../libs/serialization/binary-format.js";
import {
  GENERATED_PROVER_SETUP_PARAMS,
  GENERATED_PROVER_SPARSE_R1CS,
  GENERATED_PROVER_SUBCIRCUIT_INFOS,
  NATIVE_BACKEND_VERSION,
  SUBCIRCUIT_LIBRARY_PACKAGE_VERSION,
} from "./generated/subcircuit-library.generated.js";
import type {
  ProverPermutationEntry,
  ProverPlacementVariables,
  ProverSetupParams,
  ProverWitnessInput,
} from "./witness.js";

export interface ProverRuntimeArtifactFiles {
  readonly setupParams: RuntimeArtifactFile;
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
  readonly setupParams: RuntimeArtifactFile;
  readonly crs: RuntimeArtifactFile;
}

export type ProverWitnessRuntimeArtifactFiles = ProverProofWitnessRuntimeArtifactFiles &
  Pick<ProverCrsPreparedDataRuntimeArtifactFiles, "setupParams">;

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
  readonly xyPowers: readonly Uint8Array[];
  readonly gammaInvOInst: readonly Uint8Array[];
  readonly etaInvLiOInterAlpha4Kj: readonly Uint8Array[];
  readonly deltaInvLiOPrv: readonly Uint8Array[];
  readonly deltaInvAlphakXhTx: readonly Uint8Array[];
  readonly deltaInvAlpha4XjTx: readonly Uint8Array[];
  readonly deltaInvAlphakYiTy: readonly Uint8Array[];
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
    setupParams: await loadBundleArtifactFile(
      crsPreparedDataInput,
      RuntimeArtifactFileRole.SetupParams,
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
  assertSetupMatchesGeneratedSubcircuitLibrary(parts.setup);

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
  const setup = parseProverSetupParams(artifacts.setupParams);

  return {
    setup,
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
  assertSetupMatchesGeneratedSubcircuitLibrary(parts.setup);

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

export function parseProverSetupParams(setupParamsFile: RuntimeArtifactFile): ProverSetupParams {
  const section = requireRuntimeSection(setupParamsFile, {
    type: BinarySectionType.SetupParams,
    encoding: BinarySectionEncoding.Bytes,
    label: "setup.params",
  });
  const view = new DataView(section.data.buffer, section.data.byteOffset, section.data.byteLength);

  return {
    l_free: view.getUint32(0, true),
    l_user_out: view.getUint32(4, true),
    l_user: view.getUint32(8, true),
    l: view.getUint32(12, true),
    l_D: view.getUint32(16, true),
    m_D: view.getUint32(20, true),
    n: view.getUint32(24, true),
    s_D: view.getUint32(28, true),
    s_max: view.getUint32(32, true),
  };
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
      xyPowers: splitG1Section(crsFile, "sigma1.xy-powers"),
      gammaInvOInst: splitG1Section(crsFile, "sigma1.gamma-inv-o-inst"),
      etaInvLiOInterAlpha4Kj: splitG1Section(crsFile, "sigma1.eta-inv-li-o-inter-alpha4-kj"),
      deltaInvLiOPrv: splitG1Section(crsFile, "sigma1.delta-inv-li-o-prv"),
      deltaInvAlphakXhTx: splitG1Section(crsFile, "sigma1.delta-inv-alphak-xh-tx"),
      deltaInvAlpha4XjTx: splitG1Section(crsFile, "sigma1.delta-inv-alpha4-xj-tx"),
      deltaInvAlphakYiTy: splitG1Section(crsFile, "sigma1.delta-inv-alphak-yi-ty"),
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

function splitG1Section(artifactFile: RuntimeArtifactFile, label: string): readonly Uint8Array[] {
  const section = requireRuntimeSection(artifactFile, {
    type: BinarySectionType.CrsG1,
    encoding: BinarySectionEncoding.FfjsG1Affine96,
    label,
  });

  return splitElements(section.data, section.elementByteLength);
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

function splitElements(data: Uint8Array, elementByteLength: number): Uint8Array[] {
  if (data.byteLength % elementByteLength !== 0) {
    throw new Error("Runtime artifact section byte length is not divisible by its element width.");
  }

  const output: Uint8Array[] = [];
  for (let offset = 0; offset < data.byteLength; offset += elementByteLength) {
    output.push(data.subarray(offset, offset + elementByteLength));
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

function assertSetupMatchesGeneratedSubcircuitLibrary(setup: ProverSetupParams): void {
  const fields: readonly (keyof ProverSetupParams)[] = [
    "l_free",
    "l_user_out",
    "l_user",
    "l",
    "l_D",
    "m_D",
    "n",
    "s_D",
    "s_max",
  ];

  for (const field of fields) {
    if (setup[field] !== GENERATED_PROVER_SETUP_PARAMS[field]) {
      throw new Error(
        `Prover setup params do not match the baked subcircuit library: ${field}=${setup[field]}, expected ${GENERATED_PROVER_SETUP_PARAMS[field]}.`,
      );
    }
  }
}
