import { fileURLToPath } from "node:url";

import {
  BivariatePolynomialBuffer,
  createCurveRuntime,
  DensePolynomialExt,
  encodePolynomialBufferWithSigma1,
  encodePolynomialWithSigma1,
} from "../../../src/index.js";
import type { CurveRuntime, FieldElement, ProverCrsRuntime, ProverSetupParams } from "../../../src/index.js";

async function main(): Promise<void> {
  const runtime = await createCurveRuntime();
  try {
    await checkCommitmentOps(runtime);
  } finally {
    await runtime.terminate();
  }

  console.log("Checked prover commitment operation parity");
}

async function checkCommitmentOps(runtime: CurveRuntime): Promise<void> {
  const setup = {
    n: 2,
    s_max: 2,
    l: 0,
    l_D: 2,
  } as ProverSetupParams;
  const referenceStringYSize = setup.s_max * 2;
  const referenceStringXSize = Math.max(setup.n * 2, (setup.l_D - setup.l) * 2);
  const crs = buildSyntheticCrs(runtime, referenceStringXSize * referenceStringYSize);
  const coefficients = [
    3n,
    5n,
    0n,
    11n,
    13n,
    0n,
    17n,
    19n,
    0n,
    23n,
    29n,
    0n,
    31n,
    37n,
    0n,
    41n,
  ].map((value) => runtime.Fr.fromBigInt(value));
  const polynomial = BivariatePolynomialBuffer.fromCoeffs(runtime.Fr, coefficients, 4, 4);
  const expected = runtime.G1.mulAffineScalar(
    runtime.G1.generator,
    expectedSyntheticScalar(runtime, coefficients, referenceStringYSize),
  );

  const actualBuffer = await encodePolynomialBufferWithSigma1(runtime, crs, setup, polynomial);
  assertG1Equal(runtime, actualBuffer, expected, "encodePolynomialBufferWithSigma1");

  const actualDense = await encodePolynomialWithSigma1(
    runtime,
    crs,
    setup,
    DensePolynomialExt.fromCoeffs(runtime.Fr, coefficients, 4, 4),
  );
  assertG1Equal(runtime, actualDense, expected, "encodePolynomialWithSigma1 dense wrapper");
  const compact = await encodeCompactRectangleWithSigma1(runtime, crs, setup, polynomial);
  assertG1Equal(runtime, compact, actualBuffer, "compact rectangle commitment oracle");

  const otherCoefficients = [
    2n,
    0n,
    7n,
    0n,
    0n,
    3n,
    0n,
    5n,
    11n,
    0n,
    13n,
    0n,
    0n,
    17n,
    0n,
    19n,
  ].map((value) => runtime.Fr.fromBigInt(value));
  const alpha = runtime.Fr.fromBigInt(43n);
  const beta = runtime.Fr.fromBigInt(47n);
  const otherPolynomial = BivariatePolynomialBuffer.fromCoeffs(runtime.Fr, otherCoefficients, 4, 4);
  const combinedPolynomial = polynomial.scale(alpha).add(otherPolynomial.scale(beta));
  const combinedCommitment = await encodePolynomialBufferWithSigma1(runtime, crs, setup, combinedPolynomial);
  const linearCommitment = runtime.G1.add(
    runtime.G1.mulScalar(actualBuffer, alpha),
    runtime.G1.mulScalar(await encodePolynomialBufferWithSigma1(runtime, crs, setup, otherPolynomial), beta),
  );
  assertG1Equal(runtime, combinedCommitment, linearCommitment, "commitment linearity");

  const signedCombinedPolynomial = polynomial.scale(alpha).sub(otherPolynomial.scale(beta));
  const signedCombinedCommitment = await encodePolynomialBufferWithSigma1(runtime, crs, setup, signedCombinedPolynomial);
  const signedLinearCommitment = runtime.G1.sub(
    runtime.G1.mulScalar(actualBuffer, alpha),
    runtime.G1.mulScalar(await encodePolynomialBufferWithSigma1(runtime, crs, setup, otherPolynomial), beta),
  );
  assertG1Equal(runtime, signedCombinedCommitment, signedLinearCommitment, "signed commitment linearity");

  const zero = await encodePolynomialBufferWithSigma1(
    runtime,
    crs,
    setup,
    BivariatePolynomialBuffer.fromCoeffs(runtime.Fr, Array.from({ length: 16 }, () => runtime.Fr.zero), 4, 4),
  );
  assertG1Equal(runtime, zero, runtime.G1.zero, "zero polynomial commitment");

  await assertRejects(
    () =>
      encodePolynomialBufferWithSigma1(
        runtime,
        crs,
        setup,
        BivariatePolynomialBuffer.fromCoeffs(
          runtime.Fr,
          [1n, 0n, 0n, 0n, 1n, 0n, 0n, 0n].map((value) => runtime.Fr.fromBigInt(value)),
          8,
          1,
        ),
      ),
    "insufficient CRS bounds",
  );
}

async function encodeCompactRectangleWithSigma1(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  setup: ProverSetupParams,
  polynomial: BivariatePolynomialBuffer,
): Promise<Uint8Array> {
  const { xDegree, yDegree } = polynomial.findDegree();
  if (xDegree < 0 || yDegree < 0) {
    return runtime.G1.zero;
  }

  const xSize = xDegree + 1;
  const ySize = yDegree + 1;
  const referenceStringYSize = setup.s_max * 2;
  const bases = new Uint8Array(xSize * ySize * 96);
  const scalars = new Uint8Array(xSize * ySize * runtime.Fr.byteLength);
  let outputIndex = 0;
  for (let x = 0; x < xSize; x += 1) {
    for (let y = 0; y < ySize; y += 1) {
      const base = crs.sigma1.xyPowers[referenceStringYSize * x + y];
      if (base === undefined) {
        throw new Error("Synthetic CRS is shorter than the compact commitment oracle shape.");
      }

      bases.set(base, outputIndex * 96);
      scalars.set(runtime.Fr.toRawLittleEndian(polynomial.getCoeff(x, y)), outputIndex * runtime.Fr.byteLength);
      outputIndex += 1;
    }
  }

  return runtime.G1.msmAffineRaw(bases, scalars);
}

function buildSyntheticCrs(runtime: CurveRuntime, count: number): ProverCrsRuntime {
  return {
    sigma1: {
      xyPowers: Array.from({ length: count }, (_, index) =>
        runtime.G1.toAffine(runtime.G1.mulAffineScalar(runtime.G1.generator, runtime.Fr.fromBigInt(BigInt(index + 1)))),
      ),
    },
  } as unknown as ProverCrsRuntime;
}

function expectedSyntheticScalar(
  runtime: CurveRuntime,
  coefficients: readonly FieldElement[],
  referenceStringYSize: number,
): FieldElement {
  let output = runtime.Fr.zero;
  for (let x = 0; x < 4; x += 1) {
    for (let y = 0; y < 4; y += 1) {
      const coefficient = coefficients[x * 4 + y];
      const baseScalar = runtime.Fr.fromBigInt(BigInt(referenceStringYSize * x + y + 1));
      output = runtime.Fr.add(output, runtime.Fr.mul(coefficient, baseScalar));
    }
  }
  return output;
}

function assertG1Equal(runtime: CurveRuntime, actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (!runtime.G1.eq(actual, expected)) {
    throw new Error(`${label} mismatch`);
  }
}

async function assertRejects(fn: () => Promise<unknown>, label: string): Promise<void> {
  try {
    await fn();
  } catch {
    return;
  }
  throw new Error(`${label} did not reject`);
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Prover commitment operation check failed: ${message}`);
    process.exitCode = 1;
  });
}
