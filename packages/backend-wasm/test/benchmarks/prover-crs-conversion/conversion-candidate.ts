import { getCurveFromName } from "ffjavascript";

import { createBinaryArtifactFile } from "../../../src/artifacts/binary/binary-artifact-file.js";
import {
  BinaryArtifactFileKind,
  BinarySectionEncoding,
  BinarySectionType,
  type BinarySectionInput,
} from "../../../src/artifacts/binary/binary-format.js";
import type { DecodedCombinedSigmaRkyv } from "../../../src/converter/conversion/rkyv-to-binary.js";

const G1_AFFINE_BYTES = 96;
const G2_AFFINE_BYTES = 192;

interface RawBaseField {
  batchToMontgomery(input: Uint8Array): Promise<Uint8Array>;
}

interface RawCurve {
  readonly F1: RawBaseField;
  terminate?(): Promise<void>;
}

interface PointSectionDefinition {
  readonly label: string;
  readonly data: Uint8Array;
  readonly expectedElementCount?: number;
  readonly elementByteLength: number;
  readonly type: BinarySectionType;
  readonly encoding: BinarySectionEncoding;
}

export async function convertDecodedCombinedSigmaWithBatchMontgomery(
  decoded: DecodedCombinedSigmaRkyv,
  sourcePackageVersion: string,
): Promise<Uint8Array> {
  const curve = await getCurveFromName("bls12381") as RawCurve;

  try {
    const definitions: readonly PointSectionDefinition[] = [
      g1Definition("sigma.g1", decoded.g1, 6),
      g1Definition("sigma1.xy-powers", decoded.sigma1XyPowers),
      g1Definition("sigma1.gamma-inv-o-inst", decoded.sigma1GammaInvOInst),
      g1Definition(
        "sigma1.eta-inv-li-o-inter-alpha4-kj",
        decoded.sigma1EtaInvLiOInterAlpha4Kj,
      ),
      g1Definition("sigma1.delta-inv-li-o-prv", decoded.sigma1DeltaInvLiOPrv),
      g1Definition("sigma1.delta-inv-alphak-xh-tx", decoded.sigma1DeltaInvAlphakXhTx),
      g1Definition("sigma1.delta-inv-alpha4-xj-tx", decoded.sigma1DeltaInvAlpha4XjTx),
      g1Definition("sigma1.delta-inv-alphak-yi-ty", decoded.sigma1DeltaInvAlphakYiTy),
      g2Definition("sigma.g2", decoded.g2, 10),
    ];
    const sections: BinarySectionInput[] = [];

    for (const definition of definitions) {
      assertPointSectionShape(definition);
      const data = await curve.F1.batchToMontgomery(definition.data);
      sections.push({
        type: definition.type,
        encoding: definition.encoding,
        label: definition.label,
        elementCount: data.byteLength / definition.elementByteLength,
        elementByteLength: definition.elementByteLength,
        data,
      });
    }

    return createBinaryArtifactFile({
      kind: BinaryArtifactFileKind.ProverCrs,
      sourcePackageVersion,
      sections,
    });
  } finally {
    await curve.terminate?.();
  }
}

function g1Definition(
  label: string,
  data: Uint8Array,
  expectedElementCount?: number,
): PointSectionDefinition {
  return {
    label,
    data,
    expectedElementCount,
    elementByteLength: G1_AFFINE_BYTES,
    type: BinarySectionType.CrsG1,
    encoding: BinarySectionEncoding.FfjsG1Affine96,
  };
}

function g2Definition(
  label: string,
  data: Uint8Array,
  expectedElementCount?: number,
): PointSectionDefinition {
  return {
    label,
    data,
    expectedElementCount,
    elementByteLength: G2_AFFINE_BYTES,
    type: BinarySectionType.CrsG2,
    encoding: BinarySectionEncoding.FfjsG2Affine192,
  };
}

function assertPointSectionShape(definition: PointSectionDefinition): void {
  if (definition.data.byteLength % definition.elementByteLength !== 0) {
    throw new Error(
      `${definition.label} byte length must be a multiple of ${definition.elementByteLength}.`,
    );
  }

  const elementCount = definition.data.byteLength / definition.elementByteLength;
  if (
    definition.expectedElementCount !== undefined
    && elementCount !== definition.expectedElementCount
  ) {
    throw new Error(
      `${definition.label} must contain exactly ${definition.expectedElementCount} points.`,
    );
  }
}
