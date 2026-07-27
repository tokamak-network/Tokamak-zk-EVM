import type { FieldRuntime } from "../field/field-runtime.js";
import { BivariatePolynomialBuffer } from "./bivariate-polynomial-buffer.js";

export interface PermutationEntry {
  readonly row: number;
  readonly col: number;
  readonly X: number;
  readonly Y: number;
}

export async function buildPermutationPolynomials(
  field: FieldRuntime,
  mI: number,
  sMax: number,
  permutation: readonly PermutationEntry[],
): Promise<readonly [BivariatePolynomialBuffer, BivariatePolynomialBuffer]> {
  const omegaMI = field.rootOfUnity(mI);
  const omegaSMax = field.rootOfUnity(sMax);
  const xPowers = powerTable(field, omegaMI, mI);
  const yPowers = powerTable(field, omegaSMax, sMax);
  const rowBytes = sMax * field.byteLength;
  const s0Evals = field.createZeroBuffer(mI * sMax);
  const s1Evals = field.createZeroBuffer(mI * sMax);
  const yRow = field.concat(yPowers);

  for (let row = 0; row < mI; row += 1) {
    const rowOffset = row * rowBytes;
    const xValue = xPowers[row];
    for (let col = 0; col < sMax; col += 1) {
      s0Evals.set(xValue, rowOffset + col * field.byteLength);
    }
    s1Evals.set(yRow, rowOffset);
  }

  for (const entry of permutation) {
    assertPermutationEntry(entry, mI, sMax);
    const byteOffset = (entry.row * sMax + entry.col) * field.byteLength;
    s0Evals.set(xPowers[entry.X], byteOffset);
    s1Evals.set(yPowers[entry.Y], byteOffset);
  }

  return [
    await BivariatePolynomialBuffer.fromRouEvals(field, s0Evals, mI, sMax),
    await BivariatePolynomialBuffer.fromRouEvals(field, s1Evals, mI, sMax),
  ];
}

function powerTable(
  field: FieldRuntime,
  base: Uint8Array,
  length: number,
): readonly Uint8Array[] {
  const output = Array.from({ length }, () => field.one);
  for (let index = 1; index < length; index += 1) {
    output[index] = field.mul(output[index - 1], base);
  }
  return output;
}

function assertPermutationEntry(
  entry: PermutationEntry,
  mI: number,
  sMax: number,
): void {
  assertIndex(entry.row, mI, "row");
  assertIndex(entry.X, mI, "X");
  assertIndex(entry.col, sMax, "col");
  assertIndex(entry.Y, sMax, "Y");
}

function assertIndex(value: number, upperBound: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value >= upperBound) {
    throw new Error(`Permutation ${name} index ${value} is outside [0, ${upperBound}).`);
  }
}
