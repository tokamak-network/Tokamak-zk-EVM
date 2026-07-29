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
import type { SetupParams } from "../../artifacts/setup/setup-params.js";
import { GENERATED_SETUP_PARAMS } from "../../generated/setup.generated.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import { G1_AFFINE_BYTES } from "../../runtime/group/group.js";
import type { PermutationEntry } from "../../runtime/polynomial/permutation-polynomials.js";

const PERMUTATION_ENTRY_BYTES = 16;

export interface PreprocessBinaryInput {
  readonly permutation: Uint8Array;
  readonly instance: Uint8Array;
  readonly preprocessCrs: Uint8Array;
}

export interface PreprocessRuntimeInput {
  readonly setup: SetupParams;
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
  const setup = GENERATED_SETUP_PARAMS;

  return {
    setup,
    permutation: parsePermutation(
      permutation,
      setup.l_D - setup.l,
      setup.s_max,
    ),
    functionInstance: parseFunctionInstance(runtime, instance, setup),
    crs: parsePreprocessCrs(crs, setup),
  };
}

function parsePermutation(
  file: BinaryArtifactFileView,
  mI: number,
  sMax: number,
): readonly PermutationEntry[] {
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
    const entry = {
      row: view.getUint32(offset, true),
      col: view.getUint32(offset + 4, true),
      X: view.getUint32(offset + 8, true),
      Y: view.getUint32(offset + 12, true),
    };
    assertIndex(entry.row, mI, "row");
    assertIndex(entry.X, mI, "X");
    assertIndex(entry.col, sMax, "col");
    assertIndex(entry.Y, sMax, "Y");
    entries.push(entry);
  }
  return entries;
}

function assertIndex(value: number, upperBound: number, name: string): void {
  if (value >= upperBound) {
    throw new Error(`Permutation ${name} index ${value} is outside [0, ${upperBound}).`);
  }
}

function parseFunctionInstance(
  runtime: CurveRuntime,
  file: BinaryArtifactFileView,
  setup: SetupParams,
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
  setup: SetupParams,
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
