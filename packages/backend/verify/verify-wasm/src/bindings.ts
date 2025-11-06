/**
 * TypeScript bindings for WASM Verifier
 *
 * This module provides a type-safe interface to the Rust WASM verifier
 */

export interface SetupParams {
  l: number;
  l_D: number;
  s_D: number;
  n: number;
  s_max: number;
  l_pub_in: number;
  l_pub_out: number;
  l_prv_in: number;
  l_prv_out: number;
}

export interface BufferPt {
  valueHex: string;
  extSource?: string;
  extDest?: string;
  key: string;
}

export interface PublicInputBuffer {
  inPts: BufferPt[];
}

export interface PublicOutputBuffer {
  outPts: BufferPt[];
}

export interface Instance {
  publicInputBuffer: PublicInputBuffer;
  publicOutputBuffer: PublicOutputBuffer;
  a_pub: string[];
  a_prv: string[];
}

export enum KeccakVerificationResult {
  True = 0,
  False = 1,
  NoKeccakData = 2,
}

/**
 * WASM Verifier class
 * Provides zkSNARK verification functionality in the browser
 */
export interface IVerifier {
  /**
   * Verify Keccak256 hashes
   * @returns Verification result
   */
  verify_keccak256(): KeccakVerificationResult;

  /**
   * Basic SNARK verification (placeholder)
   * Full implementation requires proof data
   * @returns true if verification passes
   */
  verify_snark_basic(): Promise<boolean>;

  /**
   * Free WASM memory
   */
  free(): void;
}

/**
 * Initialize WASM module
 * Call this before using the Verifier
 */
export async function initWasm(): Promise<void> {
  const wasm = await import('./pkg');
  await wasm.default();
}

/**
 * Create a new Verifier instance
 *
 * @param setupParams - Setup parameters from QAP compilation
 * @param instance - Instance data from synthesizer
 * @returns Verifier instance
 */
export async function createVerifier(
  setupParams: SetupParams,
  instance: Instance,
): Promise<IVerifier> {
  const wasm = await import('./pkg');

  const setupParamsJson = JSON.stringify(setupParams);
  const instanceJson = JSON.stringify(instance);

  return new wasm.Verifier(setupParamsJson, instanceJson);
}

/**
 * Convenience function: Load and verify from JSON files
 *
 * @param setupParamsPath - Path or URL to setupParams.json
 * @param instancePath - Path or URL to instance.json
 * @returns Verification results
 */
export async function verifyFromFiles(
  setupParamsPath: string,
  instancePath: string,
): Promise<{
  keccakValid: KeccakVerificationResult;
  snarkValid: boolean;
}> {
  // Load files
  const [setupParamsRes, instanceRes] = await Promise.all([
    fetch(setupParamsPath),
    fetch(instancePath),
  ]);

  const setupParams: SetupParams = await setupParamsRes.json();
  const instance: Instance = await instanceRes.json();

  // Create verifier
  const verifier = await createVerifier(setupParams, instance);

  try {
    // Verify
    const keccakValid = verifier.verify_keccak256();
    const snarkValid = await verifier.verify_snark_basic();

    return { keccakValid, snarkValid };
  } finally {
    verifier.free();
  }
}
