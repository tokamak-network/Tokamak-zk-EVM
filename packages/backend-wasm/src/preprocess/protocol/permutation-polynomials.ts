import type { FieldRuntime } from "../../runtime/field/field-types.js";
import { BivariatePolynomialBuffer } from "../../runtime/polynomial/bivariate-polynomial-buffer.js";
import type { PermutationEntry } from "../../runtime/polynomial/permutation-polynomials.js";

export async function buildPreprocessPermutationPolynomials(
  field: FieldRuntime,
  mI: number,
  sMax: number,
  permutation: readonly PermutationEntry[],
): Promise<readonly [BivariatePolynomialBuffer, BivariatePolynomialBuffer]> {
  const xPowers = powerTable(field, field.rootOfUnity(mI), mI);
  const yPowers = powerTable(field, field.rootOfUnity(sMax), sMax);
  const rowBytes = sMax * field.byteLength;
  const s0Evals = field.createZeroBuffer(mI * sMax);
  const s1Evals = field.createZeroBuffer(mI * sMax);
  const xRow = new Uint8Array(rowBytes);
  const yRow = field.concat(yPowers);

  for (let row = 0; row < mI; row += 1) {
    repeatElement(xRow, xPowers[row]);
    const rowOffset = row * rowBytes;
    s0Evals.set(xRow, rowOffset);
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

function repeatElement(target: Uint8Array, element: Uint8Array): void {
  target.set(element, 0);
  let filled = element.byteLength;
  while (filled < target.byteLength) {
    const copyLength = Math.min(filled, target.byteLength - filled);
    target.set(target.subarray(0, copyLength), filled);
    filled += copyLength;
  }
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
