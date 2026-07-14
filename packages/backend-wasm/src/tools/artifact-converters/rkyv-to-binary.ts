import { createBinaryArtifactFile } from "../../libs/serialization/binary-artifact-file.js";
import {
  BinaryArtifactFileKind,
  BinaryDigestEntryType,
  BinarySectionEncoding,
  BinarySectionType,
  type BinarySectionInput,
} from "../../libs/serialization/binary-format.js";

const G1_AFFINE_BYTES = 96;
const G2_AFFINE_BYTES = 192;
const COMBINED_SIGMA_PAYLOAD_MAGIC = "TKCRS001";
const COMBINED_SIGMA_PAYLOAD_SECTION_COUNT = 9;

export interface RkyvToBinaryConverterOptions {
  readonly sourcePackageVersion: string;
  readonly decoder?: RkyvArchiveDecoder;
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
  if (options.decoder === undefined) {
    throw new Error(
      "combined_sigma.rkyv conversion requires a browser-compatible rkyv decoder. Pass options.decoder from tools/rkyv-decoder-wasm.",
    );
  }

  const decoded = await options.decoder.decodeCombinedSigma(input);
  const sourceDigest = await sha256(input);

  return createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.ProverCrs,
    sourcePackageVersion: requireSourcePackageVersion(options.sourcePackageVersion),
    sections: [
      createG1Section("sigma.g1", decoded.g1, 6),
      createG1Section("sigma1.xy-powers", decoded.sigma1XyPowers),
      createG1Section("sigma1.gamma-inv-o-inst", decoded.sigma1GammaInvOInst),
      createG1Section("sigma1.eta-inv-li-o-inter-alpha4-kj", decoded.sigma1EtaInvLiOInterAlpha4Kj),
      createG1Section("sigma1.delta-inv-li-o-prv", decoded.sigma1DeltaInvLiOPrv),
      createG1Section("sigma1.delta-inv-alphak-xh-tx", decoded.sigma1DeltaInvAlphakXhTx),
      createG1Section("sigma1.delta-inv-alpha4-xj-tx", decoded.sigma1DeltaInvAlpha4XjTx),
      createG1Section("sigma1.delta-inv-alphak-yi-ty", decoded.sigma1DeltaInvAlphakYiTy),
      createG2Section("sigma.g2", decoded.g2, 10),
    ],
    digests: [
      {
        type: BinaryDigestEntryType.SourceArtifactDigest,
        digest: sourceDigest,
      },
      {
        type: BinaryDigestEntryType.CombinedSigmaDigest,
        digest: sourceDigest,
      },
    ],
  });
}

export function createUnavailableRkyvArchiveDecoder(): RkyvArchiveDecoder {
  return {
    decodeCombinedSigma() {
      throw new Error(
        "tools/rkyv-decoder-wasm is not built or not supplied. Build the rkyv decoder WASM package and pass it as options.decoder.",
      );
    },
  };
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

function createG1Section(label: string, data: Uint8Array, expectedElementCount?: number): BinarySectionInput {
  return createPointSection({
    label,
    data,
    expectedElementCount,
    elementByteLength: G1_AFFINE_BYTES,
    type: BinarySectionType.CrsG1,
    encoding: BinarySectionEncoding.FfjsG1Affine96,
  });
}

function createG2Section(label: string, data: Uint8Array, expectedElementCount?: number): BinarySectionInput {
  return createPointSection({
    label,
    data,
    expectedElementCount,
    elementByteLength: G2_AFFINE_BYTES,
    type: BinarySectionType.CrsG2,
    encoding: BinarySectionEncoding.FfjsG2Affine192,
  });
}

function createPointSection(input: {
  readonly label: string;
  readonly data: Uint8Array;
  readonly expectedElementCount: number | undefined;
  readonly elementByteLength: number;
  readonly type: BinarySectionType;
  readonly encoding: BinarySectionEncoding;
}): BinarySectionInput {
  if (input.data.byteLength % input.elementByteLength !== 0) {
    throw new Error(`${input.label} byte length must be a multiple of ${input.elementByteLength}.`);
  }

  const elementCount = input.data.byteLength / input.elementByteLength;
  if (input.expectedElementCount !== undefined && elementCount !== input.expectedElementCount) {
    throw new Error(`${input.label} must contain exactly ${input.expectedElementCount} points.`);
  }

  return {
    type: input.type,
    encoding: input.encoding,
    label: input.label,
    elementCount,
    elementByteLength: input.elementByteLength,
    data: normalizeBytes(input.data),
  };
}

function normalizeBytes(bytes: Uint8Array): Uint8Array {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice();
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

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error("SHA-256 digest support is required for rkyv artifact conversion.");
  }

  const digestInput = data.slice().buffer as ArrayBuffer;
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", digestInput));
}
