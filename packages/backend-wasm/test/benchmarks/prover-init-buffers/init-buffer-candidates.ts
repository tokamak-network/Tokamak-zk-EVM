import { BivariatePolynomialBuffer } from "../../../src/runtime/polynomial/bivariate-polynomial-buffer.js";
import type { FieldElement, FieldRuntime } from "../../../src/runtime/field/field-runtime.js";
import type {
  ProverPermutationEntry,
  ProverSetupParams,
} from "../../../src/prover/protocol/witness.js";

export interface PermutationEvalBuffers {
  readonly s0: Uint8Array;
  readonly s1: Uint8Array;
}

export function buildPermutationEvalsWithArrays(
  field: FieldRuntime,
  setup: ProverSetupParams,
  permutation: readonly ProverPermutationEntry[],
): PermutationEvalBuffers {
  const mI = setup.l_D - setup.l;
  const xPowers = powerTable(field, field.rootOfUnity(mI), mI);
  const yPowers = powerTable(field, field.rootOfUnity(setup.s_max), setup.s_max);
  const s0Evals = Array.from({ length: mI * setup.s_max }, () => field.zero);
  const s1Evals = Array.from({ length: mI * setup.s_max }, () => field.zero);

  for (let row = 0; row < mI; row += 1) {
    const rowStart = row * setup.s_max;
    for (let col = 0; col < setup.s_max; col += 1) {
      s0Evals[rowStart + col] = xPowers[row];
      s1Evals[rowStart + col] = yPowers[col];
    }
  }
  for (const entry of permutation) {
    const index = entry.row * setup.s_max + entry.col;
    s0Evals[index] = xPowers[entry.X];
    s1Evals[index] = yPowers[entry.Y];
  }

  return {
    s0: field.concat(s0Evals),
    s1: field.concat(s1Evals),
  };
}

export function buildPermutationEvalsDirect(
  field: FieldRuntime,
  setup: ProverSetupParams,
  permutation: readonly ProverPermutationEntry[],
): PermutationEvalBuffers {
  const mI = setup.l_D - setup.l;
  const xPowers = powerTable(field, field.rootOfUnity(mI), mI);
  const yPowers = powerTable(field, field.rootOfUnity(setup.s_max), setup.s_max);
  const rowBytes = setup.s_max * field.byteLength;
  const s0 = field.createZeroBuffer(mI * setup.s_max);
  const s1 = field.createZeroBuffer(mI * setup.s_max);
  const yRow = field.concat(yPowers);

  for (let row = 0; row < mI; row += 1) {
    const rowOffset = row * rowBytes;
    const xValue = xPowers[row];
    for (let col = 0; col < setup.s_max; col += 1) {
      s0.set(xValue, rowOffset + col * field.byteLength);
    }
    s1.set(yRow, rowOffset);
  }
  for (const entry of permutation) {
    const byteOffset = (entry.row * setup.s_max + entry.col) * field.byteLength;
    s0.set(xPowers[entry.X], byteOffset);
    s1.set(yPowers[entry.Y], byteOffset);
  }

  return { s0, s1 };
}

export function resizeWithRowCopies(
  polynomial: BivariatePolynomialBuffer,
  targetXSize: number,
  targetYSize: number,
): BivariatePolynomialBuffer {
  const xSize = nextPowerOfTwo(targetXSize);
  const ySize = nextPowerOfTwo(targetYSize);
  if (xSize === polynomial.xSize && ySize === polynomial.ySize) {
    return polynomial.clone();
  }

  const output = polynomial.field.createZeroBuffer(xSize * ySize);
  const copyXSize = Math.min(polynomial.xSize, xSize);
  const copyYBytes = Math.min(polynomial.ySize, ySize) * polynomial.field.byteLength;
  const sourceRowBytes = polynomial.ySize * polynomial.field.byteLength;
  const targetRowBytes = ySize * polynomial.field.byteLength;
  for (let x = 0; x < copyXSize; x += 1) {
    output.set(
      polynomial.coefficients.subarray(
        x * sourceRowBytes,
        x * sourceRowBytes + copyYBytes,
      ),
      x * targetRowBytes,
    );
  }
  return BivariatePolynomialBuffer.fromOwnedBuffer(
    polynomial.field,
    output,
    xSize,
    ySize,
  );
}

export function findDegreeRaw(
  polynomial: BivariatePolynomialBuffer,
): { readonly xDegree: number; readonly yDegree: number } {
  const words = new Uint32Array(
    polynomial.coefficients.buffer,
    polynomial.coefficients.byteOffset,
    polynomial.coefficients.byteLength / 4,
  );
  const wordsPerField = polynomial.field.byteLength / 4;
  let xDegree = -1;
  let yDegree = -1;

  for (let x = polynomial.xSize - 1; x >= 0; x -= 1) {
    for (let y = 0; y < polynomial.ySize; y += 1) {
      if (!isZeroAt(words, (x * polynomial.ySize + y) * wordsPerField, wordsPerField)) {
        xDegree = x;
        break;
      }
    }
    if (xDegree !== -1) {
      break;
    }
  }
  for (let y = polynomial.ySize - 1; y >= 0; y -= 1) {
    for (let x = 0; x < polynomial.xSize; x += 1) {
      if (!isZeroAt(words, (x * polynomial.ySize + y) * wordsPerField, wordsPerField)) {
        yDegree = y;
        break;
      }
    }
    if (yDegree !== -1) {
      break;
    }
  }
  return { xDegree, yDegree };
}

export function buildSparseWitnessBaseline(
  field: FieldRuntime,
  outputElementCount: number,
  outputIndices: Uint32Array,
  values: Uint8Array,
): Uint8Array {
  const output = field.createZeroBuffer(outputElementCount);
  for (let index = 0; index < outputIndices.length; index += 1) {
    const value = values.subarray(
      index * field.byteLength,
      (index + 1) * field.byteLength,
    );
    if (!field.isZero(value)) {
      output.set(value, outputIndices[index] * field.byteLength);
    }
  }
  return output;
}

export function buildSparseWitnessRawConditional(
  field: FieldRuntime,
  outputElementCount: number,
  outputIndices: Uint32Array,
  values: Uint8Array,
): Uint8Array {
  const output = field.createZeroBuffer(outputElementCount);
  const words = new Uint32Array(values.buffer, values.byteOffset, values.byteLength / 4);
  const wordsPerField = field.byteLength / 4;
  for (let index = 0; index < outputIndices.length; index += 1) {
    if (!isZeroAt(words, index * wordsPerField, wordsPerField)) {
      output.set(
        values.subarray(index * field.byteLength, (index + 1) * field.byteLength),
        outputIndices[index] * field.byteLength,
      );
    }
  }
  return output;
}

export function buildSparseWitnessUnconditional(
  field: FieldRuntime,
  outputElementCount: number,
  outputIndices: Uint32Array,
  values: Uint8Array,
): Uint8Array {
  const output = field.createZeroBuffer(outputElementCount);
  for (let index = 0; index < outputIndices.length; index += 1) {
    output.set(
      values.subarray(index * field.byteLength, (index + 1) * field.byteLength),
      outputIndices[index] * field.byteLength,
    );
  }
  return output;
}

function powerTable(
  field: FieldRuntime,
  base: FieldElement,
  length: number,
): FieldElement[] {
  const output = Array.from({ length }, () => field.one);
  for (let index = 1; index < length; index += 1) {
    output[index] = field.mul(output[index - 1], base);
  }
  return output;
}

function isZeroAt(words: Uint32Array, wordOffset: number, wordCount: number): boolean {
  let combined = 0;
  for (let index = 0; index < wordCount; index += 1) {
    combined |= words[wordOffset + index];
  }
  return combined === 0;
}

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) {
    result *= 2;
  }
  return result;
}
