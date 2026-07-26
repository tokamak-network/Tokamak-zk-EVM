import { readFile } from "node:fs/promises";
import path from "node:path";

import type { CurveRuntime } from "../../src/runtime/curve/curve.js";
import {
  loadProverInputFromBinaryInput,
  type ProverBinaryInput,
  type ProverRuntimeInput,
} from "../../src/prover/api/binary-input.js";
import type { VerifierBinaryInput } from "../../src/verifier/api/binary-input.js";

export async function readRuntimeBinary(runtimeRoot: string, fileName: string): Promise<Uint8Array> {
  const filePath = path.resolve(runtimeRoot, fileName);
  const relative = path.relative(runtimeRoot, filePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Runtime fixture path escapes runtime root: ${fileName}`);
  }

  try {
    return new Uint8Array(await readFile(filePath));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read prepared runtime fixture ${filePath}: ${message}`);
  }
}

export async function readProverBinaryInput(runtimeRoot: string): Promise<ProverBinaryInput> {
  const [witness, permutation, instance, proverCrs] = await Promise.all([
    readRuntimeBinary(runtimeRoot, "witness.bin"),
    readRuntimeBinary(runtimeRoot, "permutation.bin"),
    readRuntimeBinary(runtimeRoot, "instance.bin"),
    readRuntimeBinary(runtimeRoot, "prover-crs.bin"),
  ]);

  return { witness, permutation, instance, proverCrs };
}

export async function readVerifierBinaryInput(
  runtimeRoot: string,
  proof?: Uint8Array,
): Promise<VerifierBinaryInput> {
  const [resolvedProof, instance, verifierPreprocess] = await Promise.all([
    proof ?? readRuntimeBinary(runtimeRoot, "proof.bin"),
    readRuntimeBinary(runtimeRoot, "instance.bin"),
    readRuntimeBinary(runtimeRoot, "verifier-preprocess.bin"),
  ]);

  return { proof: resolvedProof, instance, verifierPreprocess };
}

export async function readProverRuntimeInput(
  runtime: CurveRuntime,
  runtimeRoot: string,
): Promise<ProverRuntimeInput> {
  return loadProverInputFromBinaryInput(runtime, await readProverBinaryInput(runtimeRoot));
}
