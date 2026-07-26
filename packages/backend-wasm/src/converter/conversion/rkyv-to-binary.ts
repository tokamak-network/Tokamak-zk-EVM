import { createBinaryArtifactFile } from "../../artifacts/binary/binary-artifact-file.js";
import {
  BinaryArtifactFileKind,
  BinaryDigestEntryType,
  BinarySectionEncoding,
  BinarySectionType,
  type BinarySectionInput,
} from "../../artifacts/binary/binary-format.js";
import { createCurveRuntime, type CurveRuntime } from "../../runtime/curve/curve.js";

const G1_AFFINE_BYTES = 96;
const G2_AFFINE_BYTES = 192;
const FQ_BYTES = 48;
const FQ2_BYTES = 96;
const COMBINED_SIGMA_PAYLOAD_MAGIC = "TKCRS001";
const COMBINED_SIGMA_PAYLOAD_SECTION_COUNT = 9;

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
  const sourceDigest = await sha256(input);
  const runtime = await createCurveRuntime();

  try {
    return createBinaryArtifactFile({
      kind: BinaryArtifactFileKind.ProverCrs,
      sourcePackageVersion: requireSourcePackageVersion(options.sourcePackageVersion),
      sections: [
        createG1Section(runtime, "sigma.g1", decoded.g1, 6),
        createG1Section(runtime, "sigma1.xy-powers", decoded.sigma1XyPowers),
        createG1Section(runtime, "sigma1.gamma-inv-o-inst", decoded.sigma1GammaInvOInst),
        createG1Section(runtime, "sigma1.eta-inv-li-o-inter-alpha4-kj", decoded.sigma1EtaInvLiOInterAlpha4Kj),
        createG1Section(runtime, "sigma1.delta-inv-li-o-prv", decoded.sigma1DeltaInvLiOPrv),
        createG1Section(runtime, "sigma1.delta-inv-alphak-xh-tx", decoded.sigma1DeltaInvAlphakXhTx),
        createG1Section(runtime, "sigma1.delta-inv-alpha4-xj-tx", decoded.sigma1DeltaInvAlpha4XjTx),
        createG1Section(runtime, "sigma1.delta-inv-alphak-yi-ty", decoded.sigma1DeltaInvAlphakYiTy),
        createG2Section(runtime, "sigma.g2", decoded.g2, 10),
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
  } finally {
    await runtime.terminate();
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

function createG1Section(
  runtime: CurveRuntime,
  label: string,
  data: Uint8Array,
  expectedElementCount?: number,
): BinarySectionInput {
  return createPointSection({
    label,
    data: nativeG1SectionToFfjs(runtime, data, label),
    expectedElementCount,
    elementByteLength: G1_AFFINE_BYTES,
    type: BinarySectionType.CrsG1,
    encoding: BinarySectionEncoding.FfjsG1Affine96,
  });
}

function createG2Section(
  runtime: CurveRuntime,
  label: string,
  data: Uint8Array,
  expectedElementCount?: number,
): BinarySectionInput {
  return createPointSection({
    label,
    data: nativeG2SectionToFfjs(runtime, data, label),
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

function nativeG1SectionToFfjs(runtime: CurveRuntime, data: Uint8Array, label: string): Uint8Array {
  if (data.byteLength % G1_AFFINE_BYTES !== 0) {
    throw new Error(`${label} native G1 byte length must be a multiple of ${G1_AFFINE_BYTES}.`);
  }

  const output = new Uint8Array(data.byteLength);
  for (let offset = 0; offset < data.byteLength; offset += G1_AFFINE_BYTES) {
    const x = readLittleEndianBigInt(data.subarray(offset, offset + FQ_BYTES));
    const y = readLittleEndianBigInt(data.subarray(offset + FQ_BYTES, offset + G1_AFFINE_BYTES));
    output.set(runtime.G1.parseAffine({ x: formatCoordinateHex(x, FQ_BYTES), y: formatCoordinateHex(y, FQ_BYTES) }), offset);
  }
  return output;
}

function nativeG2SectionToFfjs(runtime: CurveRuntime, data: Uint8Array, label: string): Uint8Array {
  if (data.byteLength % G2_AFFINE_BYTES !== 0) {
    throw new Error(`${label} native G2 byte length must be a multiple of ${G2_AFFINE_BYTES}.`);
  }

  const output = new Uint8Array(data.byteLength);
  for (let offset = 0; offset < data.byteLength; offset += G2_AFFINE_BYTES) {
    const x = readNativeG2CoordinateHex(data.subarray(offset, offset + FQ2_BYTES));
    const y = readNativeG2CoordinateHex(data.subarray(offset + FQ2_BYTES, offset + G2_AFFINE_BYTES));
    output.set(runtime.G2.parseAffine({ x, y }), offset);
  }
  return output;
}

function readNativeG2CoordinateHex(bytes: Uint8Array): string {
  if (bytes.byteLength !== FQ2_BYTES) {
    throw new Error(`Native G2 coordinate must be ${FQ2_BYTES} bytes.`);
  }

  const c0 = readLittleEndianBigInt(bytes.subarray(0, FQ_BYTES));
  const c1 = readLittleEndianBigInt(bytes.subarray(FQ_BYTES, FQ2_BYTES));
  return `0x${formatCoordinateHex(c1, FQ_BYTES).slice(2)}${formatCoordinateHex(c0, FQ_BYTES).slice(2)}`;
}

function readLittleEndianBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let index = bytes.byteLength - 1; index >= 0; index -= 1) {
    value = (value << 8n) + BigInt(bytes[index]);
  }
  return value;
}

function formatCoordinateHex(value: bigint, byteLength: number): string {
  return `0x${value.toString(16).padStart(byteLength * 2, "0")}`;
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
