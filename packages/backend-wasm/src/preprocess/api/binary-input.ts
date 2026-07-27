import {
  decodeBinaryArtifactFile,
  requireBinaryArtifactSection,
} from "../../artifacts/binary/binary-artifact-file.js";
import {
  BinarySectionEncoding,
  BinarySectionType,
  type BinaryArtifactFileView,
  type BinarySectionView,
} from "../../artifacts/binary/binary-format.js";
import { GENERATED_PROVER_SETUP_PARAMS } from "../../prover/generated/subcircuit-library.generated.js";
import type { ProverSetupParams } from "../../prover/protocol/witness.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import type { PermutationEntry } from "../../runtime/polynomial/permutation-polynomials.js";

const PERMUTATION_ENTRY_BYTES = 16;
const G1_AFFINE_BYTES = 96;

export interface PreprocessBinaryInput {
  readonly permutation: Uint8Array;
  readonly instance: Uint8Array;
  readonly preprocessCrs: Uint8Array;
}

export interface PreprocessRuntimeInput {
  readonly setup: ProverSetupParams;
  readonly permutation: readonly PermutationEntry[];
  readonly functionInstance: Uint8Array;
  readonly crs: PreprocessCrsRuntime;
}

export interface PreprocessCrsRuntime {
  readonly xyPowers: Uint8Array;
  readonly gammaInvOInst: Uint8Array;
}

export async function loadPreprocessInputFromBinaryInput(
  runtime: CurveRuntime,
  input: PreprocessBinaryInput,
): Promise<PreprocessRuntimeInput> {
  const [permutation, instance, crs] = await Promise.all([
    decodeBinaryArtifactFile(input.permutation),
    decodeBinaryArtifactFile(input.instance),
    decodeBinaryArtifactFile(input.preprocessCrs),
  ]);
  const setup = GENERATED_PROVER_SETUP_PARAMS;

  return {
    setup,
    permutation: parsePermutation(permutation),
    functionInstance: parseFunctionInstance(runtime, instance, setup),
    crs: parsePreprocessCrs(crs, setup),
  };
}

function parsePermutation(file: BinaryArtifactFileView): readonly PermutationEntry[] {
  const section = requireBinaryArtifactSection(file, {
    type: BinarySectionType.Permutation,
    encoding: BinarySectionEncoding.Bytes,
    label: "permutation.entries",
  });
  if (section.data.byteLength % PERMUTATION_ENTRY_BYTES !== 0) {
    throw new Error("permutation.entries byte length must be divisible by 16.");
  }

  const view = new DataView(
    section.data.buffer,
    section.data.byteOffset,
    section.data.byteLength,
  );
  const entries: PermutationEntry[] = [];
  for (let offset = 0; offset < section.data.byteLength; offset += PERMUTATION_ENTRY_BYTES) {
    entries.push({
      row: view.getUint32(offset, true),
      col: view.getUint32(offset + 4, true),
      X: view.getUint32(offset + 8, true),
      Y: view.getUint32(offset + 12, true),
    });
  }
  return entries;
}

function parseFunctionInstance(
  runtime: CurveRuntime,
  file: BinaryArtifactFileView,
  setup: ProverSetupParams,
): Uint8Array {
  const section = requireBinaryArtifactSection(file, {
    type: BinarySectionType.Instance,
    encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
    label: "instance.function",
  });
  const expectedCount = setup.l - setup.l_free;
  assertSectionShape(section, expectedCount, runtime.Fr.byteLength, "instance.function");
  return section.data;
}

function parsePreprocessCrs(
  file: BinaryArtifactFileView,
  setup: ProverSetupParams,
): PreprocessCrsRuntime {
  const xyPowers = requireBinaryArtifactSection(file, {
    type: BinarySectionType.CrsG1,
    encoding: BinarySectionEncoding.FfjsG1Affine96,
    label: "sigma1.xy-powers",
  });
  const gammaInvOInst = requireBinaryArtifactSection(file, {
    type: BinarySectionType.CrsG1,
    encoding: BinarySectionEncoding.FfjsG1Affine96,
    label: "sigma1.gamma-inv-o-inst",
  });
  const mI = setup.l_D - setup.l;
  const mFunction = setup.l - setup.l_free;

  assertSectionShape(xyPowers, mI * setup.s_max, G1_AFFINE_BYTES, "sigma1.xy-powers");
  assertSectionShape(
    gammaInvOInst,
    mFunction,
    G1_AFFINE_BYTES,
    "sigma1.gamma-inv-o-inst",
  );
  return {
    xyPowers: xyPowers.data,
    gammaInvOInst: gammaInvOInst.data,
  };
}

function assertSectionShape(
  section: BinarySectionView,
  elementCount: number,
  elementByteLength: number,
  label: string,
): void {
  if (
    section.elementCount !== elementCount
    || section.elementByteLength !== elementByteLength
    || section.data.byteLength !== elementCount * elementByteLength
  ) {
    throw new Error(
      `${label} must contain exactly ${elementCount} elements of ${elementByteLength} bytes.`,
    );
  }
}
