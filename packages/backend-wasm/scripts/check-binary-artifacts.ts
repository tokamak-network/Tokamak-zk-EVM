import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BinaryArtifactFileKind,
  BinarySectionEncoding,
  BinarySectionType,
  createBinaryArtifactFile,
  createCurveRuntime,
  loadRuntimeArtifactFile,
  loadSigmaVerifyArtifact,
  parseRuntimeArtifactBundleManifest,
  requireRuntimeSection,
  RuntimeArtifactBundleKind,
  RuntimeArtifactFileRole,
  type AffinePointJson,
  type BinarySectionInput,
  type CurveRuntime,
  type PairingTerm,
} from "../src/index.js";

interface ScalarFixtureInput {
  readonly operands: {
    readonly a: string;
    readonly b: string;
    readonly c: string;
  };
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

async function main(): Promise<void> {
  const fixturesDir = path.resolve("fixtures/small");
  const runtime = await createCurveRuntime();

  try {
    const scalarInput = await readJson<ScalarFixtureInput>(
      path.join(fixturesDir, "input/scalar-ops-basic.json"),
    );
    const msmInput = await readJson<MsmFixtureInput>(path.join(fixturesDir, "input/msm-small.json"));
    const msmExpected = await readJson<MsmFixtureExpected>(
      path.join(fixturesDir, "expected/msm-small.json"),
    );
    const pairingInput = await readJson<PairingFixtureInput>(
      path.join(fixturesDir, "input/pairing-small.json"),
    );
    const pairingExpected = await readJson<PairingFixtureExpected>(
      path.join(fixturesDir, "expected/pairing-small.json"),
    );

    const binary = await createBinaryArtifactFile({
      kind: BinaryArtifactFileKind.Test,
      sourcePackageVersion: "0.0.0",
      sections: [
        createScalarSection(runtime, scalarInput),
        createMsmBaseSection(runtime, msmInput),
        createMsmScalarSection(runtime, msmInput),
        createPairingG1Section(runtime, "pairing.true.left.g1", pairingInput.true_case.left),
        createPairingG2Section(runtime, "pairing.true.left.g2", pairingInput.true_case.left),
        createPairingG1Section(runtime, "pairing.true.right.g1", pairingInput.true_case.right),
        createPairingG2Section(runtime, "pairing.true.right.g2", pairingInput.true_case.right),
        createPairingG1Section(runtime, "pairing.false.left.g1", pairingInput.false_case.left),
        createPairingG2Section(runtime, "pairing.false.left.g2", pairingInput.false_case.left),
        createPairingG1Section(runtime, "pairing.false.right.g1", pairingInput.false_case.right),
        createPairingG2Section(runtime, "pairing.false.right.g2", pairingInput.false_case.right),
      ],
    });
    const artifactFile = await loadRuntimeArtifactFile(binary);

    const msmBases = requireRuntimeSection(artifactFile, {
      type: BinarySectionType.MsmBases,
      encoding: BinarySectionEncoding.FfjsG1Affine96,
      label: "msm.bases",
    });
    const msmScalars = requireRuntimeSection(artifactFile, {
      type: BinarySectionType.MsmScalars,
      encoding: BinarySectionEncoding.ScalarRawLe32,
      label: "msm.scalars",
    });
    const msmResult = await runtime.G1.msmAffineRaw(msmBases.data, msmScalars.data);
    assertEqual(runtime.G1.formatAffine(msmResult), msmExpected.result, "binary G1 MSM");
    await checkSigmaVerifyArtifact(runtime);

    assertEqual(
      await runtime.pairing.productsEqual(
        readPairingTerms(artifactFile, "pairing.true.left"),
        readPairingTerms(artifactFile, "pairing.true.right"),
      ),
      pairingExpected.true_case_products_equal,
      "binary pairing true case",
    );
    assertEqual(
      await runtime.pairing.productsEqual(
        readPairingTerms(artifactFile, "pairing.false.left"),
        readPairingTerms(artifactFile, "pairing.false.right"),
      ),
      pairingExpected.false_case_products_equal,
      "binary pairing false case",
    );

    checkRuntimeBundleManifests();
  } finally {
    await runtime.terminate();
  }

  console.log("Checked runtime-ready binary artifact file round-trip");
}

function checkRuntimeBundleManifests(): void {
  parseRuntimeArtifactBundleManifest({
    schemaVersion: 1,
    kind: RuntimeArtifactBundleKind.VerifierProofInput,
    files: [
      {
        role: RuntimeArtifactFileRole.Instance,
        path: "instance.bin",
        artifactKind: BinaryArtifactFileKind.VerifierInstance,
      },
      {
        role: RuntimeArtifactFileRole.Proof,
        path: "proof.bin",
        artifactKind: BinaryArtifactFileKind.VerifierProof,
      },
    ],
  });

  parseRuntimeArtifactBundleManifest({
    schemaVersion: 1,
    kind: RuntimeArtifactBundleKind.VerifierSetupInput,
    files: [
      {
        role: RuntimeArtifactFileRole.Crs,
        path: "crs.bin",
        artifactKind: BinaryArtifactFileKind.VerifierCrs,
      },
      {
        role: RuntimeArtifactFileRole.Preprocess,
        path: "preprocess.bin",
        artifactKind: BinaryArtifactFileKind.VerifierPreprocess,
      },
    ],
  });

  assertThrows(
    () =>
      parseRuntimeArtifactBundleManifest({
        schemaVersion: 1,
        kind: RuntimeArtifactBundleKind.VerifierProofInput,
        files: [
          {
            role: RuntimeArtifactFileRole.Instance,
            path: "instance.bin",
          },
          {
            role: RuntimeArtifactFileRole.Crs,
            path: "crs.bin",
          },
        ],
      }),
    "VerifierProofInput bundle manifest must not include CRS files",
  );

  assertThrows(
    () =>
      parseRuntimeArtifactBundleManifest({
        schemaVersion: 1,
        kind: RuntimeArtifactBundleKind.VerifierProofInput,
        files: [
          {
            role: RuntimeArtifactFileRole.Instance,
            path: "../instance.bin",
          },
          {
            role: RuntimeArtifactFileRole.Proof,
            path: "proof.bin",
          },
        ],
      }),
    "Runtime artifact bundle file path must reject parent-directory traversal",
  );
}

async function checkSigmaVerifyArtifact(runtime: CurveRuntime): Promise<void> {
  const binary = await createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.VerifierCrs,
    sourcePackageVersion: "0.0.0",
    sections: [
      {
        type: BinarySectionType.CrsG1,
        encoding: BinarySectionEncoding.FfjsG1Affine96,
        label: "sigma.g1",
        elementCount: 4,
        elementByteLength: 96,
        data: concatBytes([runtime.G1.generator, runtime.G1.generator, runtime.G1.generator, runtime.G1.generator]),
      },
      {
        type: BinarySectionType.CrsG2,
        encoding: BinarySectionEncoding.FfjsG2Affine192,
        label: "sigma.g2",
        elementCount: 10,
        elementByteLength: 192,
        data: concatBytes(
          Array.from({ length: 10 }, () => runtime.G2.generator),
        ),
      },
    ],
  });
  const artifactFile = await loadRuntimeArtifactFile(binary);
  const sigma = loadSigmaVerifyArtifact(artifactFile);

  assertEqual(sigma.sections.length, 2, "sigma_verify section count");
  assertEqual(sigma.pointsByName.G.byteLength, 96, "sigma_verify G byte length");
  assertEqual(sigma.pointsByName["sigma2.y"].byteLength, 192, "sigma_verify sigma2.y byte length");
}

function createScalarSection(runtime: CurveRuntime, input: ScalarFixtureInput): BinarySectionInput {
  const values = [input.operands.a, input.operands.b, input.operands.c].map((value) =>
    runtime.Fr.fromHex(value),
  );

  return {
    type: BinarySectionType.TestScalars,
    encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
    label: "scalar.operands",
    elementCount: values.length,
    elementByteLength: 32,
    data: concatBytes(values),
  };
}

function createMsmBaseSection(runtime: CurveRuntime, input: MsmFixtureInput): BinarySectionInput {
  const bases = input.bases.map((base) => runtime.G1.parseAffine(base));

  return {
    type: BinarySectionType.MsmBases,
    encoding: BinarySectionEncoding.FfjsG1Affine96,
    label: "msm.bases",
    elementCount: bases.length,
    elementByteLength: 96,
    data: concatBytes(bases),
  };
}

function createMsmScalarSection(runtime: CurveRuntime, input: MsmFixtureInput): BinarySectionInput {
  const scalars = input.scalars.map((scalar) => runtime.Fr.toRawLittleEndian(runtime.Fr.fromHex(scalar)));

  return {
    type: BinarySectionType.MsmScalars,
    encoding: BinarySectionEncoding.ScalarRawLe32,
    label: "msm.scalars",
    elementCount: scalars.length,
    elementByteLength: 32,
    data: concatBytes(scalars),
  };
}

function createPairingG1Section(
  runtime: CurveRuntime,
  label: string,
  terms: readonly PairingTermJson[],
): BinarySectionInput {
  const points = terms.map((term) => runtime.G1.parseAffine(term.g1));

  return {
    type: BinarySectionType.PairingG1Terms,
    encoding: BinarySectionEncoding.FfjsG1Affine96,
    label,
    elementCount: points.length,
    elementByteLength: 96,
    data: concatBytes(points),
  };
}

function createPairingG2Section(
  runtime: CurveRuntime,
  label: string,
  terms: readonly PairingTermJson[],
): BinarySectionInput {
  const points = terms.map((term) => runtime.G2.parseAffine(term.g2));

  return {
    type: BinarySectionType.PairingG2Terms,
    encoding: BinarySectionEncoding.FfjsG2Affine192,
    label,
    elementCount: points.length,
    elementByteLength: 192,
    data: concatBytes(points),
  };
}

function readPairingTerms(
  artifactFile: Awaited<ReturnType<typeof loadRuntimeArtifactFile>>,
  labelPrefix: string,
): PairingTerm[] {
  const g1 = requireRuntimeSection(artifactFile, {
    type: BinarySectionType.PairingG1Terms,
    encoding: BinarySectionEncoding.FfjsG1Affine96,
    label: `${labelPrefix}.g1`,
  });
  const g2 = requireRuntimeSection(artifactFile, {
    type: BinarySectionType.PairingG2Terms,
    encoding: BinarySectionEncoding.FfjsG2Affine192,
    label: `${labelPrefix}.g2`,
  });

  if (g1.elementCount !== g2.elementCount) {
    throw new Error(`Pairing section count mismatch for ${labelPrefix}.`);
  }

  const terms: PairingTerm[] = [];
  for (let index = 0; index < g1.elementCount; index += 1) {
    terms.push({
      g1: g1.data.subarray(index * 96, (index + 1) * 96),
      g2: g2.data.subarray(index * 192, (index + 1) * 192),
    });
  }

  return terms;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
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

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertThrows(callback: () => void, label: string): void {
  try {
    callback();
  } catch {
    return;
  }

  throw new Error(`${label} did not throw.`);
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Binary artifact check failed: ${message}`);
    process.exitCode = 1;
  });
}
