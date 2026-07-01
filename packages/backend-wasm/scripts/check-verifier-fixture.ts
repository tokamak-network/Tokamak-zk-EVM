import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BinaryArtifactFileKind,
  BinarySectionEncoding,
  BinarySectionType,
  DensePolynomialExt,
  RuntimeArtifactBundleKind,
  RuntimeArtifactFileRole,
  createBinaryArtifactFile,
  createCurveRuntime,
  encodeVerifierSetupParams,
  loadVerifierInputFromRuntimeBundles,
  parseRuntimeArtifactBundleManifest,
  verifySnark,
  type AffinePointJson,
  type BinarySectionInput,
  type CurveRuntime,
  type VerifierInput,
  type VerifierPreprocess,
  type VerifierProof,
  type VerifierSetupParams,
} from "../src/index.js";

interface FullProofFixtureInput {
  readonly artifacts: {
    readonly setupParams: VerifierSetupParams;
    readonly instance: {
      readonly a_pub_user: readonly string[];
      readonly a_pub_block: readonly string[];
    };
    readonly preprocess: FormattedPreprocessJson;
    readonly proof: FormattedProofJson;
    readonly sigmaVerify: SigmaVerifyJson;
  };
}

interface FullProofFixtureExpected {
  readonly verification: {
    readonly nativeVerifierResult: boolean;
  };
}

interface FormattedPreprocessJson {
  readonly preprocess_entries_part1: readonly string[];
  readonly preprocess_entries_part2: readonly string[];
}

interface FormattedProofJson {
  readonly proof_entries_part1: readonly string[];
  readonly proof_entries_part2: readonly string[];
}

interface SigmaVerifyJson {
  readonly G: AffinePointJson;
  readonly H: AffinePointJson;
  readonly sigma_1: {
    readonly x: AffinePointJson;
    readonly y: AffinePointJson;
  };
  readonly sigma_2: {
    readonly alpha: AffinePointJson;
    readonly alpha2: AffinePointJson;
    readonly alpha3: AffinePointJson;
    readonly alpha4: AffinePointJson;
    readonly gamma: AffinePointJson;
    readonly delta: AffinePointJson;
    readonly eta: AffinePointJson;
    readonly x: AffinePointJson;
    readonly y: AffinePointJson;
  };
  readonly lagrange_KL: AffinePointJson;
}

async function main(): Promise<void> {
  const fixturesDir = path.resolve("fixtures/small");
  const input = await readJson<FullProofFixtureInput>(path.join(fixturesDir, "input/full-proof-small.json"));
  const expected = await readJson<FullProofFixtureExpected>(
    path.join(fixturesDir, "expected/full-proof-small.json"),
  );
  const runtime = await createCurveRuntime();

  try {
    const verifierInput = await buildVerifierInput(runtime, input);
    const result = await verifySnark(runtime, verifierInput, {
      randomScalar: () => runtime.Fr.one,
    });
    const binaryVerifierInput = await buildBinaryVerifierInput(runtime, input);
    const binaryResult = await verifySnark(runtime, binaryVerifierInput, {
      randomScalar: () => runtime.Fr.one,
    });

    if (result.valid !== expected.verification.nativeVerifierResult) {
      throw new Error(
        `Verifier result mismatch: expected ${expected.verification.nativeVerifierResult}, got ${result.valid}`,
      );
    }

    if (binaryResult.valid !== expected.verification.nativeVerifierResult) {
      throw new Error(
        `Binary verifier result mismatch: expected ${expected.verification.nativeVerifierResult}, got ${binaryResult.valid}`,
      );
    }
  } finally {
    await runtime.terminate();
  }

  console.log("Checked verifier orchestration against the full proof fixture");
}

async function buildVerifierInput(
  runtime: CurveRuntime,
  fixture: FullProofFixtureInput,
): Promise<VerifierInput> {
  const setup = fixture.artifacts.setupParams;
  const publicInstance = publicInstanceValues(fixture);

  return {
    setup,
    sigma: parseSigma(runtime, fixture.artifacts.sigmaVerify),
    preprocess: parsePreprocess(runtime, fixture.artifacts.preprocess),
    proof: parseProof(runtime, fixture.artifacts.proof),
    aPubX: await DensePolynomialExt.fromRouEvals(
      runtime.Fr,
      publicInstance.map((value) => runtime.Fr.fromHex(value)),
      setup.l_free,
      1,
    ),
  };
}

async function buildBinaryVerifierInput(
  runtime: CurveRuntime,
  fixture: FullProofFixtureInput,
): Promise<VerifierInput> {
  const setup = fixture.artifacts.setupParams;
  const publicInstance = publicInstanceValues(fixture);
  const files = new Map<string, Uint8Array>();
  const instanceFile = await createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.VerifierInstance,
    sourcePackageVersion: "0.0.0",
    sections: [
      {
        type: BinarySectionType.Instance,
        encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
        label: "instance.public",
        elementCount: publicInstance.length,
        elementByteLength: 32,
        data: concatBytes(publicInstance.map((value) => runtime.Fr.fromHex(value))),
      },
    ],
  });
  const proofFile = await createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.VerifierProof,
    sourcePackageVersion: "0.0.0",
    sections: [
      {
        type: BinarySectionType.Proof,
        encoding: BinarySectionEncoding.FfjsG1Affine96,
        label: "proof.g1",
        elementCount: 19,
        elementByteLength: 96,
        data: concatBytes(recoverG1Points(runtime, fixture.artifacts.proof.proof_entries_part1, fixture.artifacts.proof.proof_entries_part2, 19)),
      },
      {
        type: BinarySectionType.Proof,
        encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
        label: "proof.evals",
        elementCount: 4,
        elementByteLength: 32,
        data: concatBytes(fixture.artifacts.proof.proof_entries_part2.slice(38).map((value) => runtime.Fr.fromHex(value))),
      },
    ],
  });
  const crsFile = await createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.VerifierCrs,
    sourcePackageVersion: "0.0.0",
    sections: createSigmaVerifySections(runtime, fixture.artifacts.sigmaVerify),
  });
  const preprocessFile = await createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.VerifierPreprocess,
    sourcePackageVersion: "0.0.0",
    sections: [
      {
        type: BinarySectionType.SetupParams,
        encoding: BinarySectionEncoding.Bytes,
        label: "setup.params",
        elementCount: 1,
        elementByteLength: 36,
        data: encodeVerifierSetupParams(setup),
      },
      {
        type: BinarySectionType.Preprocess,
        encoding: BinarySectionEncoding.FfjsG1Affine96,
        label: "preprocess.g1",
        elementCount: 3,
        elementByteLength: 96,
        data: concatBytes(
          recoverG1Points(
            runtime,
            fixture.artifacts.preprocess.preprocess_entries_part1,
            fixture.artifacts.preprocess.preprocess_entries_part2,
            3,
          ),
        ),
      },
    ],
  });

  files.set("instance.bin", instanceFile);
  files.set("proof.bin", proofFile);
  files.set("crs.bin", crsFile);
  files.set("preprocess.bin", preprocessFile);

  const proofManifest = parseRuntimeArtifactBundleManifest({
    schemaVersion: 1,
    kind: RuntimeArtifactBundleKind.VerifierProofInput,
    files: [
      {
        role: RuntimeArtifactFileRole.Instance,
        path: "instance.bin",
        byteLength: instanceFile.byteLength,
        artifactKind: BinaryArtifactFileKind.VerifierInstance,
      },
      {
        role: RuntimeArtifactFileRole.Proof,
        path: "proof.bin",
        byteLength: proofFile.byteLength,
        artifactKind: BinaryArtifactFileKind.VerifierProof,
      },
    ],
  });
  const setupManifest = parseRuntimeArtifactBundleManifest({
    schemaVersion: 1,
    kind: RuntimeArtifactBundleKind.VerifierSetupInput,
    files: [
      {
        role: RuntimeArtifactFileRole.Crs,
        path: "crs.bin",
        byteLength: crsFile.byteLength,
        artifactKind: BinaryArtifactFileKind.VerifierCrs,
      },
      {
        role: RuntimeArtifactFileRole.Preprocess,
        path: "preprocess.bin",
        byteLength: preprocessFile.byteLength,
        artifactKind: BinaryArtifactFileKind.VerifierPreprocess,
      },
    ],
  });

  return loadVerifierInputFromRuntimeBundles(runtime, proofManifest, setupManifest, (path) => {
    const file = files.get(path);
    if (file === undefined) {
      throw new Error(`Missing binary verifier fixture file '${path}'.`);
    }

    return file;
  });
}

function parseSigma(runtime: CurveRuntime, value: SigmaVerifyJson): VerifierInput["sigma"] {
  return {
    G: runtime.G1.parseAffine(value.G),
    H: runtime.G2.parseAffine(value.H),
    sigma1: {
      x: runtime.G1.parseAffine(value.sigma_1.x),
      y: runtime.G1.parseAffine(value.sigma_1.y),
    },
    sigma2: {
      alpha: runtime.G2.parseAffine(value.sigma_2.alpha),
      alpha2: runtime.G2.parseAffine(value.sigma_2.alpha2),
      alpha3: runtime.G2.parseAffine(value.sigma_2.alpha3),
      alpha4: runtime.G2.parseAffine(value.sigma_2.alpha4),
      gamma: runtime.G2.parseAffine(value.sigma_2.gamma),
      delta: runtime.G2.parseAffine(value.sigma_2.delta),
      eta: runtime.G2.parseAffine(value.sigma_2.eta),
      x: runtime.G2.parseAffine(value.sigma_2.x),
      y: runtime.G2.parseAffine(value.sigma_2.y),
    },
    lagrangeKL: runtime.G1.parseAffine(value.lagrange_KL),
  };
}

function createSigmaVerifySections(runtime: CurveRuntime, value: SigmaVerifyJson): BinarySectionInput[] {
  return [
    {
      type: BinarySectionType.CrsG1,
      encoding: BinarySectionEncoding.FfjsG1Affine96,
      label: "sigma.g1",
      elementCount: 4,
      elementByteLength: 96,
      data: concatBytes([
        runtime.G1.parseAffine(value.G),
        runtime.G1.parseAffine(value.sigma_1.x),
        runtime.G1.parseAffine(value.sigma_1.y),
        runtime.G1.parseAffine(value.lagrange_KL),
      ]),
    },
    {
      type: BinarySectionType.CrsG2,
      encoding: BinarySectionEncoding.FfjsG2Affine192,
      label: "sigma.g2",
      elementCount: 10,
      elementByteLength: 192,
      data: concatBytes([
        runtime.G2.parseAffine(value.H),
        runtime.G2.parseAffine(value.sigma_2.alpha),
        runtime.G2.parseAffine(value.sigma_2.alpha2),
        runtime.G2.parseAffine(value.sigma_2.alpha3),
        runtime.G2.parseAffine(value.sigma_2.alpha4),
        runtime.G2.parseAffine(value.sigma_2.gamma),
        runtime.G2.parseAffine(value.sigma_2.delta),
        runtime.G2.parseAffine(value.sigma_2.eta),
        runtime.G2.parseAffine(value.sigma_2.x),
        runtime.G2.parseAffine(value.sigma_2.y),
      ]),
    },
  ];
}

function parsePreprocess(runtime: CurveRuntime, value: FormattedPreprocessJson): VerifierPreprocess {
  const points = recoverG1Points(runtime, value.preprocess_entries_part1, value.preprocess_entries_part2, 3);

  return {
    s0: points[0],
    s1: points[1],
    O_pub_fix: points[2],
  };
}

function publicInstanceValues(fixture: FullProofFixtureInput): readonly string[] {
  const setup = fixture.artifacts.setupParams;
  const publicInstance = [
    ...fixture.artifacts.instance.a_pub_user.slice(0, setup.l_user),
    ...fixture.artifacts.instance.a_pub_block.slice(0, setup.l_free - setup.l_user),
  ];

  if (publicInstance.length !== setup.l_free) {
    throw new Error("Full proof fixture public instance length does not match setupParams.l_free.");
  }

  return publicInstance;
}

function parseProof(runtime: CurveRuntime, value: FormattedProofJson): VerifierProof {
  const points = recoverG1Points(runtime, value.proof_entries_part1, value.proof_entries_part2, 19);
  const scalarSlice = value.proof_entries_part2.slice(38);

  if (scalarSlice.length !== 4) {
    throw new Error("Formatted proof must contain four scalar evaluations.");
  }

  return {
    binding: {
      A_free: points[18],
      O_pub_free: points[17],
      O_mid: points[3],
      O_prv: points[4],
    },
    proof0: {
      U: points[0],
      V: points[1],
      W: points[2],
      Q_AX: points[5],
      Q_AY: points[6],
      B: points[11],
    },
    proof1: {
      R: points[12],
    },
    proof2: {
      Q_CX: points[7],
      Q_CY: points[8],
    },
    proof3: {
      R_eval: runtime.Fr.fromHex(scalarSlice[0]),
      R_omegaX_eval: runtime.Fr.fromHex(scalarSlice[1]),
      R_omegaX_omegaY_eval: runtime.Fr.fromHex(scalarSlice[2]),
      V_eval: runtime.Fr.fromHex(scalarSlice[3]),
    },
    proof4: {
      Pi_X: points[9],
      Pi_Y: points[10],
      M_X: points[14],
      M_Y: points[13],
      N_X: points[16],
      N_Y: points[15],
    },
  };
}

function recoverG1Points(
  runtime: CurveRuntime,
  part1: readonly string[],
  part2: readonly string[],
  count: number,
): ReturnType<CurveRuntime["G1"]["parseAffine"]>[] {
  if (part1.length !== count * 2 || part2.length < count * 2) {
    throw new Error("Formatted G1 point parts do not match the expected count.");
  }

  const points: ReturnType<CurveRuntime["G1"]["parseAffine"]>[] = [];
  for (let index = 0; index < count * 2; index += 2) {
    points.push(
      runtime.G1.parseAffine({
        x: joinG1Coordinate(part1[index], part2[index]),
        y: joinG1Coordinate(part1[index + 1], part2[index + 1]),
      }),
    );
  }

  return points;
}

function joinG1Coordinate(part1: string, part2: string): string {
  return `0x${stripHex(part1).padStart(32, "0")}${stripHex(part2).padStart(64, "0")}`;
}

function stripHex(value: string): string {
  if (!/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new Error("Expected a 0x-prefixed hexadecimal string.");
  }

  return value.slice(2);
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Verifier fixture check failed: ${message}`);
    process.exitCode = 1;
  });
}
