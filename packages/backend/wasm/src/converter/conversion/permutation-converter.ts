import { createBinaryArtifactFile } from "../../artifacts/binary/binary-artifact-file.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../version.js";
import { SYNTHESIZER_BROWSER_ARTIFACT_CONTRACT } from "../../generated/synthesizer-browser-artifact-contract.generated.js";
import { PROVER_PERMUTATION_V1_SPEC } from "../../generated/browser-artifact-contracts.generated.js";
import { isRecord, parseU32 } from "./conversion-utils.js";
import {
  requireProducerSourceField,
  requireProducerSourceFields,
} from "./producer-artifact-contract.js";

const PERMUTATION_ARTIFACT_NAME = "prover_permutation";
const permutationSourceFields = requireProducerSourceFields(
  SYNTHESIZER_BROWSER_ARTIFACT_CONTRACT,
  PERMUTATION_ARTIFACT_NAME,
);
const permutationRowField = requireProducerSourceField(permutationSourceFields, "row", PERMUTATION_ARTIFACT_NAME);
const permutationColumnField = requireProducerSourceField(permutationSourceFields, "column", PERMUTATION_ARTIFACT_NAME);
const permutationXField = requireProducerSourceField(permutationSourceFields, "x", PERMUTATION_ARTIFACT_NAME);
const permutationYField = requireProducerSourceField(permutationSourceFields, "y", PERMUTATION_ARTIFACT_NAME);
const [permutationEntriesSectionSpec] = PROVER_PERMUTATION_V1_SPEC.sections;

interface NativePermutationEntry {
  readonly row: number;
  readonly col: number;
  readonly X: number;
  readonly Y: number;
}

export async function convertPermutation(permutation: unknown): Promise<Uint8Array> {
  const entries = parseNativePermutationJson(permutation);

  return createBinaryArtifactFile({
    kind: PROVER_PERMUTATION_V1_SPEC.kind,
    sourcePackageVersion: BACKEND_WASM_PACKAGE_VERSION,
    sections: [
      {
        ...permutationEntriesSectionSpec,
        elementCount: entries.length,
        elementByteLength: 16,
        data: encodePermutationEntries(entries),
      },
    ],
  });
}

function parseNativePermutationJson(raw: unknown): readonly NativePermutationEntry[] {
  if (!Array.isArray(raw)) {
    throw new Error("Native permutation JSON must be an array.");
  }

  return raw.map((entry, index): NativePermutationEntry => {
    if (!isRecord(entry)) {
      throw new Error(`Native permutation entry ${index} must be an object.`);
    }

    return {
      row: parseU32(entry[permutationRowField], `permutation[${index}].${permutationRowField}`),
      col: parseU32(entry[permutationColumnField], `permutation[${index}].${permutationColumnField}`),
      X: parseU32(entry[permutationXField], `permutation[${index}].${permutationXField}`),
      Y: parseU32(entry[permutationYField], `permutation[${index}].${permutationYField}`),
    };
  });
}

function encodePermutationEntries(entries: readonly NativePermutationEntry[]): Uint8Array {
  const output = new Uint8Array(entries.length * 16);
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);

  for (let index = 0; index < entries.length; index += 1) {
    const offset = index * 16;
    const entry = entries[index];
    view.setUint32(offset, entry.row, true);
    view.setUint32(offset + 4, entry.col, true);
    view.setUint32(offset + 8, entry.X, true);
    view.setUint32(offset + 12, entry.Y, true);
  }

  return output;
}
