import { createBinaryArtifactFile } from "../../artifacts/binary/binary-artifact-file.js";
import {
  BinaryArtifactFileKind,
  BinarySectionEncoding,
  BinarySectionType,
} from "../../artifacts/binary/binary-format.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../prover/api/version.js";
import { createCurveRuntime, type CurveRuntime } from "../../runtime/curve/curve.js";
import { concatBytes, isRecord, parseHexStringArray } from "./conversion-utils.js";
import { recoverG1Points } from "./g1-coordinate-format.js";

interface FormattedPreprocessJson {
  readonly preprocess_entries_part1: readonly string[];
  readonly preprocess_entries_part2: readonly string[];
}

export async function convertVerifierPreprocess(preprocess: unknown): Promise<Uint8Array> {
  const runtime = await createCurveRuntime();
  try {
    return createVerifierPreprocessArtifact(runtime, preprocess, BACKEND_WASM_PACKAGE_VERSION);
  } finally {
    await runtime.terminate();
  }
}

async function createVerifierPreprocessArtifact(
  runtime: CurveRuntime,
  raw: unknown,
  sourcePackageVersion: string,
): Promise<Uint8Array> {
  const preprocess = parseFormattedPreprocessJson(raw);
  const points = recoverG1Points(runtime, preprocess.preprocess_entries_part1, preprocess.preprocess_entries_part2, 3);

  return createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.VerifierPreprocess,
    sourcePackageVersion,
    sections: [
      {
        type: BinarySectionType.Preprocess,
        encoding: BinarySectionEncoding.FfjsG1Affine96,
        label: "preprocess.g1",
        elementCount: 3,
        elementByteLength: 96,
        data: concatBytes(points),
      },
    ],
  });
}

function parseFormattedPreprocessJson(raw: unknown): FormattedPreprocessJson {
  if (!isRecord(raw)) {
    throw new Error("Formatted preprocess JSON must be an object.");
  }

  return {
    preprocess_entries_part1: parseHexStringArray(raw.preprocess_entries_part1, "preprocess.preprocess_entries_part1"),
    preprocess_entries_part2: parseHexStringArray(raw.preprocess_entries_part2, "preprocess.preprocess_entries_part2"),
  };
}
