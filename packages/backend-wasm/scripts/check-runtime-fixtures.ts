import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createCurveRuntime, type AffinePointJson, type PairingTerm } from "../src/index.js";

interface ScalarFixtureInput {
  readonly operands: {
    readonly a: string;
    readonly b: string;
    readonly c: string;
  };
}

interface ScalarFixtureExpected {
  readonly results: Record<string, string>;
}

interface MsmFixtureInput {
  readonly bases: readonly AffinePointJson[];
  readonly scalars: readonly string[];
}

interface MsmFixtureExpected {
  readonly result: AffinePointJson;
}

interface PairingFixtureInput {
  readonly true_case: PairingFixtureCase;
  readonly false_case: PairingFixtureCase;
}

interface PairingFixtureCase {
  readonly left: readonly PairingTermJson[];
  readonly right: readonly PairingTermJson[];
}

interface PairingTermJson {
  readonly g1: AffinePointJson;
  readonly g2: AffinePointJson;
}

interface PairingFixtureExpected {
  readonly true_case_products_equal: boolean;
  readonly false_case_products_equal: boolean;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function main(): Promise<void> {
  const fixturesDir = path.resolve("fixtures/small");
  const runtime = await createCurveRuntime();

  try {
    const scalarInput = await readJson<ScalarFixtureInput>(
      path.join(fixturesDir, "input/scalar-ops-basic.json"),
    );
    const scalarExpected = await readJson<ScalarFixtureExpected>(
      path.join(fixturesDir, "expected/scalar-ops-basic.json"),
    );
    const a = runtime.Fr.fromHex(scalarInput.operands.a);
    const b = runtime.Fr.fromHex(scalarInput.operands.b);
    const c = runtime.Fr.fromHex(scalarInput.operands.c);

    assertEqual(runtime.Fr.toHex(runtime.Fr.zero), scalarExpected.results.zero, "scalar zero");
    assertEqual(runtime.Fr.toHex(runtime.Fr.one), scalarExpected.results.one, "scalar one");
    assertEqual(runtime.Fr.toHex(a), scalarExpected.results.a, "scalar a");
    assertEqual(runtime.Fr.toHex(b), scalarExpected.results.b, "scalar b");
    assertEqual(runtime.Fr.toHex(c), scalarExpected.results.c, "scalar c");
    assertEqual(runtime.Fr.toHex(runtime.Fr.add(a, b)), scalarExpected.results.add_ab, "scalar add");
    assertEqual(runtime.Fr.toHex(runtime.Fr.sub(a, b)), scalarExpected.results.sub_ab, "scalar sub");
    assertEqual(runtime.Fr.toHex(runtime.Fr.mul(a, b)), scalarExpected.results.mul_ab, "scalar mul");
    assertEqual(runtime.Fr.toHex(runtime.Fr.neg(a)), scalarExpected.results.neg_a, "scalar neg");
    assertEqual(runtime.Fr.toHex(runtime.Fr.inv(b)), scalarExpected.results.inv_b, "scalar inv");
    assertEqual(runtime.Fr.toHex(runtime.Fr.pow(a, 5n)), scalarExpected.results.pow_a_5, "scalar pow");
    assertEqual(runtime.Fr.toHex(runtime.Fr.fromHex(runtime.Fr.toHex(c))), scalarExpected.results.round_trip_c, "scalar round trip");

    const msmInput = await readJson<MsmFixtureInput>(path.join(fixturesDir, "input/msm-small.json"));
    const msmExpected = await readJson<MsmFixtureExpected>(
      path.join(fixturesDir, "expected/msm-small.json"),
    );
    const msmBases = msmInput.bases.map((base) => runtime.G1.parseAffine(base));
    const msmScalars = msmInput.scalars.map((scalar) => runtime.Fr.fromHex(scalar));
    const msmResult = await runtime.G1.msmAffine(msmBases, msmScalars);
    assertEqual(runtime.G1.formatAffine(msmResult), msmExpected.result, "G1 MSM");

    const pairingInput = await readJson<PairingFixtureInput>(
      path.join(fixturesDir, "input/pairing-small.json"),
    );
    const pairingExpected = await readJson<PairingFixtureExpected>(
      path.join(fixturesDir, "expected/pairing-small.json"),
    );
    assertEqual(
      await runtime.pairing.productsEqual(
        parsePairingTerms(runtime, pairingInput.true_case.left),
        parsePairingTerms(runtime, pairingInput.true_case.right),
      ),
      pairingExpected.true_case_products_equal,
      "pairing true case",
    );
    assertEqual(
      await runtime.pairing.productsEqual(
        parsePairingTerms(runtime, pairingInput.false_case.left),
        parsePairingTerms(runtime, pairingInput.false_case.right),
      ),
      pairingExpected.false_case_products_equal,
      "pairing false case",
    );
  } finally {
    await runtime.terminate();
  }

  console.log("Checked runtime field, MSM, and pairing fixtures");
}

function parsePairingTerms(
  runtime: Awaited<ReturnType<typeof createCurveRuntime>>,
  terms: readonly PairingTermJson[],
): PairingTerm[] {
  return terms.map((term) => ({
    g1: runtime.G1.parseAffine(term.g1),
    g2: runtime.G2.parseAffine(term.g2),
  }));
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Runtime fixture check failed: ${message}`);
    process.exitCode = 1;
  });
}
