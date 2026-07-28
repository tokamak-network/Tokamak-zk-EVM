import type { PreprocessRuntimeInput } from "../../../src/preprocess/api/binary-input.js";
import { createPreprocessOutput } from "../../../src/preprocess/api/output.js";
import { commitDensePreprocessPolynomial } from "../../../src/preprocess/commitments/preprocess-commitments.js";
import type { CurveRuntime } from "../../../src/runtime/curve/curve.js";
import type { FieldRuntime } from "../../../src/runtime/field/field-types.js";
import { BivariatePolynomialBuffer } from "../../../src/runtime/polynomial/bivariate-polynomial-buffer.js";
import type { PermutationEntry } from "../../../src/runtime/polynomial/permutation-polynomials.js";

const chunkPoints = 2 ** 17;
const g1AffineBytes = 96;

export async function preprocessSpeedCandidate(
  runtime: CurveRuntime,
  input: PreprocessRuntimeInput,
): Promise<Uint8Array> {
  const polynomials = await buildPermutationPolynomialsRowTemplate(
    runtime.Fr,
    input.setup.l_D - input.setup.l,
    input.setup.s_max,
    input.permutation,
  );
  const [s0, s1] = await Promise.all([
    commitDensePreprocessPolynomial(
      runtime,
      input.crs.xyPowers,
      polynomials[0],
      chunkPoints,
    ),
    commitDensePreprocessPolynomial(
      runtime,
      input.crs.xyPowers,
      polynomials[1],
      chunkPoints,
    ),
  ]);
  const oPubFix = await commitFunctionInstanceCopied(
    runtime,
    input.crs.gammaInvOInst,
    input.functionInstance,
  );
  return createPreprocessOutput(runtime, s0, s1, oPubFix);
}

async function buildPermutationPolynomialsRowTemplate(
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
    const byteOffset = (entry.row * sMax + entry.col) * field.byteLength;
    s0Evals.set(xPowers[entry.X], byteOffset);
    s1Evals.set(yPowers[entry.Y], byteOffset);
  }

  return [
    await BivariatePolynomialBuffer.fromRouEvals(field, s0Evals, mI, sMax),
    await BivariatePolynomialBuffer.fromRouEvals(field, s1Evals, mI, sMax),
  ];
}

async function commitFunctionInstanceCopied(
  runtime: CurveRuntime,
  gammaInvOInst: Uint8Array,
  functionInstance: Uint8Array,
): Promise<Uint8Array> {
  const pointCount = gammaInvOInst.byteLength / g1AffineBytes;
  const copiedBases = new Uint8Array(gammaInvOInst.byteLength);
  const rawScalars = new Uint8Array(functionInstance.byteLength);
  for (let index = 0; index < pointCount; index += 1) {
    copiedBases.set(
      gammaInvOInst.subarray(index * g1AffineBytes, (index + 1) * g1AffineBytes),
      index * g1AffineBytes,
    );
    rawScalars.set(
      runtime.Fr.toRawLittleEndian(
        functionInstance.subarray(
          index * runtime.Fr.byteLength,
          (index + 1) * runtime.Fr.byteLength,
        ),
      ),
      index * runtime.Fr.byteLength,
    );
  }
  return runtime.G1.msmAffineRaw(copiedBases, rawScalars);
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
