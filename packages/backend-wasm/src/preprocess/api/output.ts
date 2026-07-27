import { createBinaryArtifactFile } from "../../artifacts/binary/binary-artifact-file.js";
import {
  BinaryArtifactFileKind,
  BinarySectionEncoding,
  BinarySectionType,
} from "../../artifacts/binary/binary-format.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../version.js";

export async function createPreprocessOutput(
  runtime: CurveRuntime,
  s0: Uint8Array,
  s1: Uint8Array,
  oPubFix: Uint8Array,
): Promise<Uint8Array> {
  const points = [s0, s1, oPubFix].map((point) => runtime.G1.toAffine(point));
  const data = new Uint8Array(points.length * 96);
  for (let index = 0; index < points.length; index += 1) {
    if (points[index].byteLength !== 96) {
      throw new Error("Preprocess output must contain 96-byte affine G1 points.");
    }
    data.set(points[index], index * 96);
  }

  return createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.VerifierPreprocess,
    sourcePackageVersion: BACKEND_WASM_PACKAGE_VERSION,
    sections: [
      {
        type: BinarySectionType.Preprocess,
        encoding: BinarySectionEncoding.FfjsG1Affine96,
        label: "preprocess.g1",
        elementCount: 3,
        elementByteLength: 96,
        data,
      },
    ],
  });
}
