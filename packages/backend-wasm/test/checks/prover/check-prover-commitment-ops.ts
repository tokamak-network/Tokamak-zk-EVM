import { fileURLToPath } from "node:url";

import {
  BivariatePolynomialBuffer,
  createCurveRuntime,
} from "../../../src/index.js";
import {
  proverCrsG1PointAt,
  type CurveRuntime,
  type FieldElement,
  type ProverCrsRuntime,
  type ProverSetupParams,
} from "../../../src/index.js";
import { encodePolynomialBufferWithSigma1 } from "../../../src/prover/commitments/sigma1-encoder.js";

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

  await checkLargeDenseChunkedCommitment(runtime);
}

async function checkLargeDenseChunkedCommitment(runtime: CurveRuntime): Promise<void> {
  const setup = {
    n: 128,
    s_max: 64,
    l: 0,
    l_D: 128,
  } as ProverSetupParams;
  const referenceStringYSize = setup.s_max * 2;
  const referenceStringXSize = Math.max(setup.n * 2, (setup.l_D - setup.l) * 2);
  const xSize = 256;
  const ySize = referenceStringYSize;
  const crs = buildSyntheticCrs(runtime, referenceStringXSize * referenceStringYSize);
  const coefficients = Array.from({ length: xSize * ySize }, (_, index) =>
    runtime.Fr.fromBigInt(BigInt((index % 251) + 1)),
  );
  const polynomial = BivariatePolynomialBuffer.fromCoeffs(runtime.Fr, coefficients, xSize, ySize);

  const actual = await encodePolynomialBufferWithSigma1(runtime, crs, setup, polynomial);
  const compact = await encodeCompactRectangleWithSigma1(runtime, crs, setup, polynomial);
  assertG1Equal(runtime, actual, compact, "large dense chunked commitment");
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
      const base = proverCrsG1PointAt(crs.sigma1.xyPowers, referenceStringYSize * x + y);

      bases.set(base, outputIndex * 96);
      scalars.set(runtime.Fr.toRawLittleEndian(polynomial.getCoeff(x, y)), outputIndex * runtime.Fr.byteLength);
      outputIndex += 1;
    }
  }

  return runtime.G1.msmAffineRaw(bases, scalars);
}

function buildSyntheticCrs(runtime: CurveRuntime, count: number): ProverCrsRuntime {
  const xyPowers: Uint8Array[] = [];
  let point = runtime.G1.generator;
  for (let index = 0; index < count; index += 1) {
    xyPowers.push(runtime.G1.toAffine(point));
    point = runtime.G1.add(point, runtime.G1.generator);
  }

  return {
    sigma1: {
      xyPowers: {
        data: concatBytes(xyPowers),
        count: xyPowers.length,
        elementByteLength: 96,
      },
    },
  } as unknown as ProverCrsRuntime;
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
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
