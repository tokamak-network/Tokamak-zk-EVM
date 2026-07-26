import { getCurveFromName } from "ffjavascript";

import {
  convertCombinedSigmaRkyvToProverCrsBinary,
  type DecodedCombinedSigmaRkyv,
} from "../../../src/converter/conversion/rkyv-to-binary.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../../src/version.js";
import { convertDecodedCombinedSigmaWithBatchMontgomery } from "./conversion-candidate.js";

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

async function main(): Promise<void> {
  const decoded = await createEdgeCaseDecodedSigma();
  const source = new Uint8Array([0x52, 0x4b, 0x59, 0x56]);
  const baseline = await convertCombinedSigmaRkyvToProverCrsBinary(source, {
    sourcePackageVersion: BACKEND_WASM_PACKAGE_VERSION,
    decoder: {
      decodeCombinedSigma: () => decoded,
    },
  });
  const candidate = await convertDecodedCombinedSigmaWithBatchMontgomery(
    source,
    decoded,
    BACKEND_WASM_PACKAGE_VERSION,
  );
  assertBytesEqual(candidate, baseline);
  console.log("Checked batch Montgomery Prover CRS conversion parity for G1/G2 edge points");
}

async function createEdgeCaseDecodedSigma(): Promise<DecodedCombinedSigmaRkyv> {
  const curve = await getCurveFromName("bls12381") as RawCurve;
  try {
    const g1Points = [
      curve.G1.zeroAffine,
      curve.G1.oneAffine,
      curve.G1.neg(curve.G1.oneAffine),
    ];
    const g2Points = [
      curve.G2.zeroAffine,
      curve.G2.oneAffine,
      curve.G2.neg(curve.G2.oneAffine),
    ];
    const nativeG1 = await curve.F1.batchFromMontgomery(concatBytes(g1Points));
    const nativeG2 = await curve.F1.batchFromMontgomery(concatBytes(g2Points));
    const g1 = splitPoints(nativeG1, 96);
    const g2 = splitPoints(nativeG2, 192);

    return {
      g1: concatBytes([g1[0], g1[1], g1[2], g1[1], g1[0], g1[2]]),
      sigma1XyPowers: concatBytes([g1[1], g1[2], g1[0]]),
      sigma1GammaInvOInst: concatBytes([g1[2], g1[1]]),
      sigma1EtaInvLiOInterAlpha4Kj: concatBytes([g1[0], g1[2], g1[1], g1[2]]),
      sigma1DeltaInvLiOPrv: concatBytes([g1[1], g1[0], g1[1]]),
      sigma1DeltaInvAlphakXhTx: concatBytes([g1[2], g1[2]]),
      sigma1DeltaInvAlpha4XjTx: concatBytes([g1[0], g1[1]]),
      sigma1DeltaInvAlphakYiTy: concatBytes([g1[1], g1[2], g1[0]]),
      g2: concatBytes([
        g2[0],
        g2[1],
        g2[2],
        g2[1],
        g2[0],
        g2[2],
        g2[1],
        g2[2],
        g2[0],
        g2[1],
      ]),
    };
  } finally {
    await curve.terminate?.();
  }
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

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array): void {
  if (
    actual.byteLength !== expected.byteLength
    || actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error("Batch Montgomery Prover CRS conversion does not match the baseline.");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
