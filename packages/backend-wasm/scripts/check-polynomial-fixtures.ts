import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DensePolynomialExt, createCurveRuntime } from "../src/index.js";

interface Ntt1dFixtureInput {
  readonly cases: readonly Ntt1dInputCase[];
}

interface Ntt1dInputCase {
  readonly id: string;
  readonly x_size: number;
  readonly y_size: number;
  readonly coefficients: readonly string[];
}

interface Ntt1dFixtureExpected {
  readonly cases: readonly Ntt1dExpectedCase[];
}

interface Ntt1dExpectedCase {
  readonly id: string;
  readonly forward_evals: readonly string[];
  readonly inverse_recovered_coefficients: readonly string[];
}

interface Ntt2dFixtureInput {
  readonly x_size: number;
  readonly y_size: number;
  readonly coefficients: readonly string[];
}

interface Ntt2dFixtureExpected {
  readonly forward_evals: readonly string[];
  readonly inverse_recovered_coefficients: readonly string[];
}

interface CosetNttFixtureInput extends Ntt2dFixtureInput {
  readonly coset_x: string;
  readonly coset_y: string;
}

interface CosetNttFixtureExpected {
  readonly coset_evals: readonly string[];
  readonly scaled_coefficients_evals: readonly string[];
  readonly inverse_recovered_coefficients: readonly string[];
}

interface PolynomialEvalFixtureInput extends Ntt2dFixtureInput {
  readonly points: readonly PolynomialEvalPoint[];
}

interface PolynomialEvalPoint {
  readonly id: string;
  readonly x: string;
  readonly y: string;
}

interface PolynomialEvalFixtureExpected {
  readonly evaluations: readonly PolynomialEvalExpected[];
}

interface PolynomialEvalExpected {
  readonly id: string;
  readonly value: string;
}

async function main(): Promise<void> {
  const fixturesDir = path.resolve("fixtures/small");
  const runtime = await createCurveRuntime();

  try {
    await checkNtt1d(fixturesDir, runtime.Fr);
    await checkNtt2d(fixturesDir, runtime.Fr);
    await checkCosetNtt(fixturesDir, runtime.Fr);
    await checkPolynomialEval(fixturesDir, runtime.Fr);
  } finally {
    await runtime.terminate();
  }

  console.log("Checked runtime polynomial NTT, coset NTT, and evaluation fixtures");
}

async function checkNtt1d(
  fixturesDir: string,
  field: Awaited<ReturnType<typeof createCurveRuntime>>["Fr"],
): Promise<void> {
  const input = await readJson<Ntt1dFixtureInput>(path.join(fixturesDir, "input/ntt-1d-small.json"));
  const expected = await readJson<Ntt1dFixtureExpected>(
    path.join(fixturesDir, "expected/ntt-1d-small.json"),
  );

  for (const testCase of input.cases) {
    const expectedCase = expected.cases.find((candidate) => candidate.id === testCase.id);
    if (expectedCase === undefined) {
      throw new Error(`Missing expected NTT 1D case: ${testCase.id}.`);
    }

    const polynomial = DensePolynomialExt.fromHexCoeffs(
      field,
      testCase.coefficients,
      testCase.x_size,
      testCase.y_size,
    );
    const forward = await polynomial.toRouEvals();
    assertEqual(formatFields(field, forward), expectedCase.forward_evals, `NTT 1D forward ${testCase.id}`);

    const recovered = await DensePolynomialExt.fromRouEvals(
      field,
      forward,
      testCase.x_size,
      testCase.y_size,
    );
    assertEqual(recovered.toHexCoeffs(), expectedCase.inverse_recovered_coefficients, `NTT 1D inverse ${testCase.id}`);
  }
}

async function checkNtt2d(
  fixturesDir: string,
  field: Awaited<ReturnType<typeof createCurveRuntime>>["Fr"],
): Promise<void> {
  const input = await readJson<Ntt2dFixtureInput>(path.join(fixturesDir, "input/ntt-2d-small.json"));
  const expected = await readJson<Ntt2dFixtureExpected>(
    path.join(fixturesDir, "expected/ntt-2d-small.json"),
  );
  const polynomial = DensePolynomialExt.fromHexCoeffs(field, input.coefficients, input.x_size, input.y_size);
  const forward = await polynomial.toRouEvals();

  assertEqual(formatFields(field, forward), expected.forward_evals, "NTT 2D forward");

  const recovered = await DensePolynomialExt.fromRouEvals(field, forward, input.x_size, input.y_size);
  assertEqual(recovered.toHexCoeffs(), expected.inverse_recovered_coefficients, "NTT 2D inverse");
}

async function checkCosetNtt(
  fixturesDir: string,
  field: Awaited<ReturnType<typeof createCurveRuntime>>["Fr"],
): Promise<void> {
  const input = await readJson<CosetNttFixtureInput>(path.join(fixturesDir, "input/coset-ntt-small.json"));
  const expected = await readJson<CosetNttFixtureExpected>(
    path.join(fixturesDir, "expected/coset-ntt-small.json"),
  );
  const cosetX = field.fromHex(input.coset_x);
  const cosetY = field.fromHex(input.coset_y);
  const polynomial = DensePolynomialExt.fromHexCoeffs(field, input.coefficients, input.x_size, input.y_size);
  const cosetEvals = await polynomial.toRouEvals(cosetX, cosetY);

  assertEqual(formatFields(field, cosetEvals), expected.coset_evals, "coset NTT forward");

  const scaled = polynomial.scaleCoeffsX(cosetX).scaleCoeffsY(cosetY);
  assertEqual(
    formatFields(field, await scaled.toRouEvals()),
    expected.scaled_coefficients_evals,
    "coset NTT scaled coefficient equivalence",
  );

  const recovered = await DensePolynomialExt.fromRouEvals(
    field,
    cosetEvals,
    input.x_size,
    input.y_size,
    cosetX,
    cosetY,
  );
  assertEqual(recovered.toHexCoeffs(), expected.inverse_recovered_coefficients, "coset NTT inverse");
}

async function checkPolynomialEval(
  fixturesDir: string,
  field: Awaited<ReturnType<typeof createCurveRuntime>>["Fr"],
): Promise<void> {
  const input = await readJson<PolynomialEvalFixtureInput>(
    path.join(fixturesDir, "input/polynomial-eval-small.json"),
  );
  const expected = await readJson<PolynomialEvalFixtureExpected>(
    path.join(fixturesDir, "expected/polynomial-eval-small.json"),
  );
  const polynomial = DensePolynomialExt.fromHexCoeffs(field, input.coefficients, input.x_size, input.y_size);

  for (const point of input.points) {
    const expectedValue = expected.evaluations.find((candidate) => candidate.id === point.id);
    if (expectedValue === undefined) {
      throw new Error(`Missing expected polynomial evaluation: ${point.id}.`);
    }

    const actual = polynomial.eval(field.fromHex(point.x), field.fromHex(point.y));
    assertEqual(field.toHex(actual), expectedValue.value, `polynomial evaluation ${point.id}`);
  }
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function formatFields(
  field: Awaited<ReturnType<typeof createCurveRuntime>>["Fr"],
  values: readonly Uint8Array[],
): string[] {
  return values.map((value) => field.toHex(value));
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Polynomial fixture check failed: ${message}`);
    process.exitCode = 1;
  });
}
