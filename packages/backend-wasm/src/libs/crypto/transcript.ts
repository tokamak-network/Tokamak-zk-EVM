import type { FieldElement, FieldRuntime } from "../runtime/field.js";
import type { AffinePointJson, G1Point, G1Runtime } from "../runtime/group.js";
import { keccak256 } from "./keccak.js";

export interface ChallengeTranscript {
  squeezeChallenge(): FieldElement;
}

const STATE_BYTES = 32;
const UPDATE_INPUT_BYTES = 100;
const CHALLENGE_INPUT_BYTES = 72;
const DST_0_TAG = 0;
const DST_1_TAG = 1;
const CHALLENGE_DST_TAG = 2;

export class RollingKeccakTranscript implements ChallengeTranscript {
  private statePart0: Uint8Array = new Uint8Array(STATE_BYTES);
  private statePart1: Uint8Array = new Uint8Array(STATE_BYTES);
  private challengeCounter = 0;

  constructor(private readonly scalarField: FieldRuntime) {}

  commitBytes(bytes: Uint8Array): this {
    this.update(bytes);
    return this;
  }

  commitField(value: FieldElement): this {
    this.update(fieldToSolidityBytes(this.scalarField.toRawLittleEndian(value)));
    return this;
  }

  commitFieldHex(value: string): this {
    return this.commitField(this.scalarField.fromHex(value));
  }

  commitBls12381FieldElementHex(value: string): this {
    const bytes = hexToFixedBytes(value, 48);
    const part1Padded = new Uint8Array(STATE_BYTES);
    part1Padded.set(bytes.subarray(0, 16), 16);

    this.update(part1Padded);
    this.update(bytes.subarray(16, 48));
    return this;
  }

  commitG1Affine(value: AffinePointJson): this {
    this.commitBls12381FieldElementHex(value.x);
    this.commitBls12381FieldElementHex(value.y);
    return this;
  }

  commitG1Point(value: G1Point, group: G1Runtime): this {
    return this.commitG1Affine(group.formatAffine(value));
  }

  squeezeChallenge(): FieldElement {
    const raw = this.getChallengeRaw();
    raw[0] &= 0x1f;

    const value = bytesToBigInt(raw);
    if (value === 0n) {
      return this.scalarField.one;
    }

    return this.scalarField.fromBigInt(value);
  }

  getChallenges(count: number): FieldElement[] {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error("Challenge count must be a non-negative safe integer.");
    }

    const challenges: FieldElement[] = [];
    for (let index = 0; index < count; index += 1) {
      challenges.push(this.squeezeChallenge());
    }

    return challenges;
  }

  private update(bytes: Uint8Array): void {
    if (bytes.byteLength > STATE_BYTES) {
      throw new Error("Transcript update input must be 32 bytes or less.");
    }

    const oldState0 = this.statePart0;
    const oldState1 = this.statePart1;
    const input = new Uint8Array(UPDATE_INPUT_BYTES);

    input[3] = DST_0_TAG;
    input.set(oldState0, 4);
    input.set(oldState1, 36);
    input.set(bytes, UPDATE_INPUT_BYTES - bytes.byteLength);
    this.statePart0 = keccak256(input);

    input[3] = DST_1_TAG;
    this.statePart1 = keccak256(input);
  }

  private getChallengeRaw(): Uint8Array {
    if (this.challengeCounter > 0xffffffff) {
      throw new Error("Transcript challenge counter overflow.");
    }

    const input = new Uint8Array(CHALLENGE_INPUT_BYTES);
    input[3] = CHALLENGE_DST_TAG;
    input.set(this.statePart0, 4);
    input.set(this.statePart1, 36);
    input[68] = (this.challengeCounter >>> 24) & 0xff;
    input[69] = (this.challengeCounter >>> 16) & 0xff;
    input[70] = (this.challengeCounter >>> 8) & 0xff;
    input[71] = this.challengeCounter & 0xff;
    this.challengeCounter += 1;

    return keccak256(input);
  }
}

function fieldToSolidityBytes(rawLittleEndian: Uint8Array): Uint8Array {
  const trimmed =
    rawLittleEndian.byteLength > STATE_BYTES
      ? rawLittleEndian.subarray(rawLittleEndian.byteLength - STATE_BYTES)
      : rawLittleEndian;
  const output = new Uint8Array(STATE_BYTES);

  for (let source = 0; source < trimmed.byteLength; source += 1) {
    output[STATE_BYTES - 1 - source] = trimmed[source];
  }

  return output;
}

function hexToFixedBytes(value: string, byteLength: number): Uint8Array {
  if (!/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new Error("Expected a 0x-prefixed hexadecimal value.");
  }

  const hex = value.slice(2);
  if (hex.length > byteLength * 2) {
    throw new Error(`Hex value does not fit in ${byteLength} bytes.`);
  }

  const padded = hex.padStart(byteLength * 2, "0");
  const output = new Uint8Array(byteLength);
  for (let index = 0; index < byteLength; index += 1) {
    output[index] = Number.parseInt(padded.slice(index * 2, index * 2 + 2), 16);
  }

  return output;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }

  return value;
}
