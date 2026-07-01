import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  RollingKeccakTranscript,
  createCurveRuntime,
  type AffinePointJson,
  type PairingTerm,
} from "../src/index.js";

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

interface TranscriptFixtureInput {
  readonly operations: readonly TranscriptOperation[];
}

type TranscriptOperation =
  | {
      readonly type: "CommitBytes";
      readonly value_hex: string;
    }
  | {
      readonly type: "CommitField";
      readonly value: string;
    }
  | {
      readonly type: "CommitG1";
      readonly value: AffinePointJson;
    }
  | {
      readonly type: "GetChallenges";
      readonly count: number;
    };

interface TranscriptFixtureExpected {
  readonly challenges: readonly string[];
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

    const transcriptInput = await readJson<TranscriptFixtureInput>(
      path.join(fixturesDir, "input/transcript-small.json"),
    );
    const transcriptExpected = await readJson<TranscriptFixtureExpected>(
      path.join(fixturesDir, "expected/transcript-small.json"),
    );
    const transcript = new RollingKeccakTranscript(runtime.Fr);
    const challenges: string[] = [];

    for (const operation of transcriptInput.operations) {
      switch (operation.type) {
        case "CommitBytes":
          transcript.commitBytes(parseHexBytes(operation.value_hex));
          break;
        case "CommitField":
          transcript.commitFieldHex(operation.value);
          break;
        case "CommitG1":
          transcript.commitG1Affine(operation.value);
          break;
        case "GetChallenges":
          challenges.push(...transcript.getChallenges(operation.count).map((challenge) => runtime.Fr.toHex(challenge)));
          break;
      }
    }

    assertEqual(challenges, transcriptExpected.challenges, "RollingKeccakTranscript challenges");
  } finally {
    await runtime.terminate();
  }

  console.log("Checked runtime field, MSM, pairing, and transcript fixtures");
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

function parseHexBytes(value: string): Uint8Array {
  if (!/^0x([0-9a-fA-F]{2})*$/.test(value)) {
    throw new Error("Expected a 0x-prefixed even-length byte string.");
  }

  const hex = value.slice(2);
  const output = new Uint8Array(hex.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }

  return output;
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Runtime fixture check failed: ${message}`);
    process.exitCode = 1;
  });
}
