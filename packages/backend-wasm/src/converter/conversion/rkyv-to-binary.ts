import { getCurveFromName } from "ffjavascript";

import { createBinaryArtifactFile } from "../../artifacts/binary/binary-artifact-file.js";
import {
  BinaryArtifactFileKind,
  BinarySectionEncoding,
  BinarySectionType,
  type BinarySectionInput,
} from "../../artifacts/binary/binary-format.js";

const G1_AFFINE_BYTES = 96;
const G2_AFFINE_BYTES = 192;
const COMBINED_SIGMA_PAYLOAD_MAGIC = "TKCRS001";
const COMBINED_SIGMA_PAYLOAD_SECTION_COUNT = 9;

interface RawBaseField {
  batchToMontgomery(input: Uint8Array): Promise<Uint8Array>;
}

interface ConverterCurve {
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

export interface RkyvToBinaryConverterOptions {
  readonly sourcePackageVersion: string;
  readonly decoder: RkyvArchiveDecoder;
}

export interface RkyvArchiveDecoder {
  decodeCombinedSigma(input: Uint8Array): Promise<DecodedCombinedSigmaRkyv> | DecodedCombinedSigmaRkyv;
}

export interface DecodedCombinedSigmaRkyv {
  readonly g1: Uint8Array;
  readonly sigma1XyPowers: Uint8Array;
  readonly sigma1GammaInvOInst: Uint8Array;
  readonly sigma1EtaInvLiOInterAlpha4Kj: Uint8Array;
  readonly sigma1DeltaInvLiOPrv: Uint8Array;
  readonly sigma1DeltaInvAlphakXhTx: Uint8Array;
  readonly sigma1DeltaInvAlpha4XjTx: Uint8Array;
  readonly sigma1DeltaInvAlphakYiTy: Uint8Array;
  readonly g2: Uint8Array;
}

export async function convertCombinedSigmaRkyvToProverCrsBinary(
  input: Uint8Array,
  options: RkyvToBinaryConverterOptions,
): Promise<Uint8Array> {
  const decoded = await options.decoder.decodeCombinedSigma(input);
  const curve = await getCurveFromName("bls12381") as ConverterCurve;

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
      sourcePackageVersion: requireSourcePackageVersion(options.sourcePackageVersion),
      sections,
    });
  } finally {
    await curve.terminate?.();
  }
}

export function createCombinedSigmaRkyvPayloadDecoder(
  decodePayload: (input: Uint8Array) => Uint8Array | Promise<Uint8Array>,
): RkyvArchiveDecoder {
  return {
    async decodeCombinedSigma(input) {
      return decodeCombinedSigmaRkyvPayload(await decodePayload(input));
    },
  };
}

export function decodeCombinedSigmaRkyvPayload(payload: Uint8Array): DecodedCombinedSigmaRkyv {
  const sections = readCombinedSigmaPayloadSections(payload);

  return {
    g1: sections[0],
    sigma1XyPowers: sections[1],
    sigma1GammaInvOInst: sections[2],
    sigma1EtaInvLiOInterAlpha4Kj: sections[3],
    sigma1DeltaInvLiOPrv: sections[4],
    sigma1DeltaInvAlphakXhTx: sections[5],
    sigma1DeltaInvAlpha4XjTx: sections[6],
    sigma1DeltaInvAlphakYiTy: sections[7],
    g2: sections[8],
  };
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

function readCombinedSigmaPayloadSections(payload: Uint8Array): readonly Uint8Array[] {
  const magicBytes = new TextEncoder().encode(COMBINED_SIGMA_PAYLOAD_MAGIC);

  if (payload.byteLength < 12) {
    throw new Error("combined_sigma decoder payload is shorter than the fixed header.");
  }

  for (let index = 0; index < magicBytes.byteLength; index += 1) {
    if (payload[index] !== magicBytes[index]) {
      throw new Error("combined_sigma decoder payload magic mismatch.");
    }
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const sectionCount = view.getUint32(8, true);
  if (sectionCount !== COMBINED_SIGMA_PAYLOAD_SECTION_COUNT) {
    throw new Error(`combined_sigma decoder payload must contain ${COMBINED_SIGMA_PAYLOAD_SECTION_COUNT} sections.`);
  }

  const lengthsOffset = 12;
  const dataOffset = lengthsOffset + sectionCount * 4;
  if (payload.byteLength < dataOffset) {
    throw new Error("combined_sigma decoder payload is shorter than its section length table.");
  }

  const lengths: number[] = [];
  for (let index = 0; index < sectionCount; index += 1) {
    lengths.push(view.getUint32(lengthsOffset + index * 4, true));
  }

  const sections: Uint8Array[] = [];
  let offset = dataOffset;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    if (offset + length > payload.byteLength) {
      throw new Error(`combined_sigma decoder payload section ${index} exceeds the payload length.`);
    }
    sections.push(payload.slice(offset, offset + length));
    offset += length;
  }

  if (offset !== payload.byteLength) {
    throw new Error("combined_sigma decoder payload contains trailing bytes.");
  }

  return sections;
}

function requireSourcePackageVersion(value: string): string {
  if (value.trim() !== value || value === "") {
    throw new Error("rkyv converter sourcePackageVersion must be a non-empty trimmed string.");
  }

  return value;
}
