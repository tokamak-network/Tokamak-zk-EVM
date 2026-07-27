import { getCurveFromName } from "ffjavascript";

import { decodeBinaryArtifactFile } from "../../../src/artifacts/binary/binary-artifact-file.js";
import {
  convertCombinedSigmaRkyvToProverCrsBinary,
  type DecodedCombinedSigmaRkyv,
} from "../../../src/converter/conversion/rkyv-to-binary.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../../src/version.js";

interface RawField {
  batchFromMontgomery(input: Uint8Array): Promise<Uint8Array>;
}

interface RawGroup {
  readonly oneAffine: Uint8Array;
  readonly zeroAffine: Uint8Array;
  neg(point: Uint8Array): Uint8Array;
}

interface RawCurve {
  readonly F1: RawField;
  readonly G1: RawGroup;
  readonly G2: RawGroup;
  terminate?(): Promise<void>;
}

interface ExpectedSection {
  readonly label: string;
  readonly data: Uint8Array;
}

interface EdgeCaseFixture {
  readonly decoded: DecodedCombinedSigmaRkyv;
  readonly expectedSections: readonly ExpectedSection[];
}

async function main(): Promise<void> {
  const fixture = await createEdgeCaseFixture();
  const artifact = await convertCombinedSigmaRkyvToProverCrsBinary(
    new Uint8Array([0x52, 0x4b, 0x59, 0x56]),
    {
      sourcePackageVersion: BACKEND_WASM_PACKAGE_VERSION,
      decoder: {
        decodeCombinedSigma: () => fixture.decoded,
      },
    },
  );
  const artifactFile = await decodeBinaryArtifactFile(artifact);

  if (artifactFile.sections.length !== fixture.expectedSections.length) {
    throw new Error("Converted Prover CRS section count mismatch.");
  }

  for (let index = 0; index < fixture.expectedSections.length; index += 1) {
    const actual = artifactFile.sections[index];
    const expected = fixture.expectedSections[index];
    if (actual.label !== expected.label) {
      throw new Error(
        `Converted Prover CRS section label mismatch: expected ${expected.label}, got ${actual.label}.`,
      );
    }
    assertBytesEqual(actual.data, expected.data, expected.label);
  }

  console.log("Checked batch Montgomery Prover CRS conversion for G1/G2 edge points");
}

async function createEdgeCaseFixture(): Promise<EdgeCaseFixture> {
  const curve = await getCurveFromName("bls12381") as RawCurve;
  try {
    const g1Montgomery = [
      curve.G1.zeroAffine,
      curve.G1.oneAffine,
      curve.G1.neg(curve.G1.oneAffine),
    ];
    const g2Montgomery = [
      curve.G2.zeroAffine,
      curve.G2.oneAffine,
      curve.G2.neg(curve.G2.oneAffine),
    ];
    const g1Native = splitPoints(
      await curve.F1.batchFromMontgomery(concatBytes(g1Montgomery)),
      96,
    );
    const g2Native = splitPoints(
      await curve.F1.batchFromMontgomery(concatBytes(g2Montgomery)),
      192,
    );
    const g1Patterns = [
      [0, 1, 2, 1, 0, 2],
      [1, 2, 0],
      [2, 1],
      [0, 2, 1, 2],
      [1, 0, 1],
      [2, 2],
      [0, 1],
      [1, 2, 0],
    ] as const;
    const g2Pattern = [0, 1, 2, 1, 0, 2, 1, 2, 0, 1] as const;
    const labels = [
      "sigma.g1",
      "sigma1.xy-powers",
      "sigma1.gamma-inv-o-inst",
      "sigma1.eta-inv-li-o-inter-alpha4-kj",
      "sigma1.delta-inv-li-o-prv",
      "sigma1.delta-inv-alphak-xh-tx",
      "sigma1.delta-inv-alpha4-xj-tx",
      "sigma1.delta-inv-alphak-yi-ty",
    ] as const;
    const nativeG1Sections = g1Patterns.map((pattern) => selectPoints(g1Native, pattern));
    const expectedG1Sections = g1Patterns.map(
      (pattern) => selectPoints(g1Montgomery, pattern),
    );
    const nativeG2Section = selectPoints(g2Native, g2Pattern);
    const expectedG2Section = selectPoints(g2Montgomery, g2Pattern);

    return {
      decoded: {
        g1: nativeG1Sections[0],
        sigma1XyPowers: nativeG1Sections[1],
        sigma1GammaInvOInst: nativeG1Sections[2],
        sigma1EtaInvLiOInterAlpha4Kj: nativeG1Sections[3],
        sigma1DeltaInvLiOPrv: nativeG1Sections[4],
        sigma1DeltaInvAlphakXhTx: nativeG1Sections[5],
        sigma1DeltaInvAlpha4XjTx: nativeG1Sections[6],
        sigma1DeltaInvAlphakYiTy: nativeG1Sections[7],
        g2: nativeG2Section,
      },
      expectedSections: [
        ...labels.map((label, index) => ({
          label,
          data: expectedG1Sections[index],
        })),
        {
          label: "sigma.g2",
          data: expectedG2Section,
        },
      ],
    };
  } finally {
    await curve.terminate?.();
  }
}

function selectPoints(
  points: readonly Uint8Array[],
  indexes: readonly number[],
): Uint8Array {
  return concatBytes(indexes.map((index) => points[index]));
}

function splitPoints(input: Uint8Array, pointBytes: number): readonly Uint8Array[] {
  if (input.byteLength % pointBytes !== 0) {
    throw new Error("Synthetic native point buffer is misaligned.");
  }
  const points: Uint8Array[] = [];
  for (let offset = 0; offset < input.byteLength; offset += pointBytes) {
    points.push(input.slice(offset, offset + pointBytes));
  }
  return points;
}

function concatBytes(inputs: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(
    inputs.reduce((byteLength, input) => byteLength + input.byteLength, 0),
  );
  let offset = 0;
  for (const input of inputs) {
    output.set(input, offset);
    offset += input.byteLength;
  }
  return output;
}

function assertBytesEqual(
  actual: Uint8Array,
  expected: Uint8Array,
  label: string,
): void {
  if (
    actual.byteLength !== expected.byteLength
    || actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(`${label} does not match the expected affine buffer.`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
