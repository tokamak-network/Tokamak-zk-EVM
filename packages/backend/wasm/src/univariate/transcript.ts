import { keccak256 } from "../runtime/crypto/keccak.js";
import type { G1Point, G1Runtime } from "../runtime/group/group.js";
import type { FieldElement, FieldRuntime } from "../runtime/field/field-types.js";

const TEXT_ENCODER = new TextEncoder();
export const UNIVARIATE_FIAT_SHAMIR_SCHEMA_ID = "tokamak-zk-evm-univariate-fs";
const TRANSCRIPT_DOMAIN = TEXT_ENCODER.encode(UNIVARIATE_FIAT_SHAMIR_SCHEMA_ID);

/** Builds the type-tagged, length-prefixed F2--F4 encoding. */
export class CanonicalTranscriptEncoder {
  private readonly chunks: Uint8Array[] = [];

  bytes(label: string, value: Uint8Array): this {
    const labelBytes = TEXT_ENCODER.encode(label);
    if (labelBytes.byteLength > 0xffffffff) {
      throw new Error("Transcript label exceeds u32 length.");
    }
    const labelHeader = new Uint8Array(4);
    new DataView(labelHeader.buffer).setUint32(0, labelBytes.byteLength, false);
    const valueHeader = new Uint8Array(8);
    new DataView(valueHeader.buffer).setBigUint64(0, BigInt(value.byteLength), false);
    this.chunks.push(labelHeader, labelBytes, valueHeader, value);
    return this;
  }

  u32(label: string, value: number): this {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
      throw new Error("Transcript u32 value is outside its range.");
    }
    const encoded = new Uint8Array(4);
    new DataView(encoded.buffer).setUint32(0, value, false);
    return this.bytes(label, encoded);
  }

  scalar(label: string, field: FieldRuntime, value: FieldElement): this {
    return this.bytes(label, bigEndianFieldBytes(field, value));
  }

  finish(): Uint8Array {
    const length = this.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    for (const chunk of this.chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  }
}
/** F4 Keccak-256 challenge state for the univariate protocol. */
export class UnivariateTranscript {
  private input: Uint8Array;
  private message: Uint8Array = new Uint8Array();
  constructor(private readonly field: FieldRuntime, publicInputs: readonly FieldElement[]) {
    this.input = encodePublicInputs(field, publicInputs);
  }
  setMessage(encodedMessage: Uint8Array): void {
    this.message = encodedMessage;
  }
  challenge(round: number, outputIndex: number): FieldElement {
    const value = this.sampleValue(round, outputIndex, () => true);
    this.recordChallenge(outputIndex, value);
    return value;
  }
  /** Samples F3's `(beta, gamma_C)` from the same F4 transcript state. */
  challengePair(round: number): readonly [
    FieldElement,
    FieldElement
  ] {
    const first = this.sampleValue(round, 0, () => true);
    const second = this.sampleValue(round, 1, () => true);
    this.input = new CanonicalTranscriptEncoder()
      .scalar("challenge.0", this.field, first)
      .scalar("challenge.1", this.field, second).finish();
    return [first, second];
  }
  zeta(arithmeticSize: number, connectionSize: number): FieldElement {
    const value = this.sampleValue(4, 0, (candidate) => (!this.field.eq(candidate, this.field.zero)
      && !this.field.eq(this.field.pow(candidate, arithmeticSize), this.field.one)
      && !this.field.eq(this.field.pow(candidate, connectionSize), this.field.one)));
    this.recordChallenge(0, value);
    return value;
  }
  nonzeroChallenge(round: number, outputIndex: number): FieldElement {
    const value = this.sampleValue(round, outputIndex, (candidate) => !this.field.eq(candidate, this.field.zero));
    this.recordChallenge(outputIndex, value);
    return value;
  }
  private sampleValue(round: number, outputIndex: number, accepts: (value: FieldElement) => boolean): FieldElement {
    for(let counter = 0; counter <= 0xffffffff; counter += 1) {
      const input = new CanonicalTranscriptEncoder()
        .bytes("protocol", TRANSCRIPT_DOMAIN)
        .u32("round", round)
        .u32("output-index", outputIndex)
        .bytes("input", this.input)
        .bytes("message", this.message)
        .u32("rejection-counter", counter)
        .finish();
      const candidate = bytesToBigInt(keccak256(input));
      if(candidate >= this.field.modulus) {
        continue;
      }
      const value = this.field.fromBigInt(candidate);
      if(!accepts(value)) {
        continue;
      }
      return value;
    }
    throw new Error("Fiat--Shamir rejection counter overflow.");
  }
  private recordChallenge(outputIndex: number, value: FieldElement): void {
    this.input = new CanonicalTranscriptEncoder().scalar(`challenge.${outputIndex}`, this.field, value).finish();
  }
}

/** Encodes F1's adaptive public statement and no fixed verifier parameter. */
export function encodePublicInputs(field: FieldRuntime, publicInputs: readonly FieldElement[]): Uint8Array {
  let encoder = new CanonicalTranscriptEncoder().u32("public-input-count", publicInputs.length);
  for (let index = 0; index < publicInputs.length; index += 1) {
    encoder = encoder.scalar(`public-input.${index}`, field, publicInputs[index]!);
  }
  return encoder.finish();
}

/** Encodes one affine G1 message block in the F2/F4 order. */
export function encodeG1MessageBlock(
  label: string,
  g1: G1Runtime,
  points: readonly G1Point[],
): Uint8Array {
  let encoder = new CanonicalTranscriptEncoder().u32("count", points.length);
  for (const [index, point] of points.entries()) {
    encoder = encoder.bytes(`${label}.${index}`, canonicalG1Bytes(g1, point));
  }
  return encoder.finish();
}
/** Encodes F4's seven scalar evaluation values in their fixed protocol order. */
export function encodeEvaluationMessageBlock(field: FieldRuntime, evaluations: readonly FieldElement[]): Uint8Array {
  if(evaluations.length !== 7) {
    throw new Error("F4 evaluation message must contain exactly seven field elements.");
  }
  const labels = ["s_C", "u", "v", "w", "b", "r", "r_plus"];
  let encoder = new CanonicalTranscriptEncoder();
  for(const [index, value] of evaluations.entries()) {
    encoder = encoder.scalar(labels[index]!, field, value);
  }
  return encoder.finish();
}

function bigEndianFieldBytes(field: FieldRuntime, value: FieldElement): Uint8Array {
  const littleEndian = field.toRawLittleEndian(value);
  const output = littleEndian.slice();
  output.reverse();
  return output;
}

function canonicalG1Bytes(g1: G1Runtime, point: G1Point): Uint8Array {
  const coordinates = g1.formatAffine(point);
  return concatBytes([
    bigEndianHexBytes(coordinates.x, 48),
    bigEndianHexBytes(coordinates.y, 48),
  ]);
}

function bigEndianHexBytes(value: string, width: number): Uint8Array {
  const body = value.startsWith("0x") ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]*$/.test(body) || body.length > width * 2) {
    throw new Error("Affine coordinate is not a fixed-width hexadecimal value.");
  }
  const padded = body.padStart(width * 2, "0");
  const result = new Uint8Array(width);
  for (let index = 0; index < width; index += 1) {
    result[index] = Number.parseInt(padded.slice(index * 2, index * 2 + 2), 16);
  }
  return result;
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  return value;
}
