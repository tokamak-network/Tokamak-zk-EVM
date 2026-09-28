import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  crsProvenanceFileName,
  parseCrsProvenance,
  type CrsProvenance,
} from "../../src/generated/crs-provenance-validator.generated.js";
import { validateCrsProvenanceCompatibility } from "../../src/artifacts/binary/compatibility.js";

const TAU_SEQUENCE_FILE_NAME = "tau_sequence.rkyv";
const PROVER_KEYS_FILE_NAME = "prover_keys.rkyv";
const PREPROCESS_KEYS_FILE_NAME = "preprocess_keys.rkyv";
const VERIFIER_KEYS_FILE_NAME = "verifier_keys.rkyv";

export interface VerifiedFinalCrsInput {
  readonly directory: string;
  readonly provenance: CrsProvenance;
  readonly tauSequence: Uint8Array;
  readonly proverKeys: Uint8Array;
  readonly preprocessKeys: Uint8Array;
  readonly verifierKeys: Uint8Array;
}

/**
 * Loads a complete final CRS generation for a browser-package production build.
 * Publication-only provenance fields are deliberately not used as consumer gates.
 */
export async function loadVerifiedFinalCrsInput(
  directoryValue: string,
): Promise<VerifiedFinalCrsInput> {
  const directory = path.resolve(requireDirectoryValue(directoryValue));
  await assertDirectory(directory);

  const provenancePath = path.join(directory, crsProvenanceFileName());
  const [provenanceBytes, tauSequence, proverKeys, preprocessKeys, verifierKeys] = await Promise.all([
    readRequiredFile(provenancePath),
    readRequiredFile(path.join(directory, TAU_SEQUENCE_FILE_NAME)),
    readRequiredFile(path.join(directory, PROVER_KEYS_FILE_NAME)),
    readRequiredFile(path.join(directory, PREPROCESS_KEYS_FILE_NAME)),
    readRequiredFile(path.join(directory, VERIFIER_KEYS_FILE_NAME)),
  ]);
  const provenance = parseProvenance(provenanceBytes, provenancePath);
  validateCrsProvenanceCompatibility(provenance);
  assertDigest(tauSequence, provenance.artifacts[TAU_SEQUENCE_FILE_NAME]!, TAU_SEQUENCE_FILE_NAME);
  assertDigest(proverKeys, provenance.artifacts[PROVER_KEYS_FILE_NAME]!, PROVER_KEYS_FILE_NAME);
  assertDigest(
    preprocessKeys,
    provenance.artifacts[PREPROCESS_KEYS_FILE_NAME]!,
    PREPROCESS_KEYS_FILE_NAME,
  );
  assertDigest(verifierKeys, provenance.artifacts[VERIFIER_KEYS_FILE_NAME]!, VERIFIER_KEYS_FILE_NAME);

  return {
    directory,
    provenance,
    tauSequence,
    proverKeys,
    preprocessKeys,
    verifierKeys,
  };
}

function requireDirectoryValue(value: string): string {
  if (value.trim() === "") {
    throw new Error(
      "Verifier CRS generation requires BACKEND_WASM_VERIFIER_CRS_DIR to name a final CRS directory.",
    );
  }
  return value;
}

async function assertDirectory(directory: string): Promise<void> {
  try {
    if (!(await stat(directory)).isDirectory()) {
      throw new Error("not a directory");
    }
  } catch (error) {
    throw new Error(`Final CRS directory is not available at ${directory}: ${message(error)}`);
  }
}

async function readRequiredFile(filePath: string): Promise<Uint8Array> {
  try {
    return await readFile(filePath);
  } catch (error) {
    throw new Error(`Final CRS artifact is not available at ${filePath}: ${message(error)}`);
  }
}

function parseProvenance(bytes: Uint8Array, filePath: string): CrsProvenance {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new Error(`Cannot parse final CRS provenance ${filePath}: ${message(error)}`);
  }
  return parseCrsProvenance(value, `Final CRS provenance ${filePath}`);
}

function assertDigest(bytes: Uint8Array, expected: string, fileName: string): void {
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) {
    throw new Error(
      `Final CRS ${fileName} SHA-256 does not match crs_provenance.json: expected ${expected}, actual ${actual}.`,
    );
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
