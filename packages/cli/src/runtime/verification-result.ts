export interface BackendVerificationResult {
  readonly contractVersion: 1;
  readonly verified: boolean;
}

/** Parse the sole stdout record from the backend verifier result mode. */
export function parseBackendVerificationResult(stdout: string): BackendVerificationResult {
  let value: unknown;
  try {
    value = JSON.parse(stdout) as unknown;
  } catch (error) {
    throw new Error(`Verifier did not emit valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Verifier result must be a JSON object.');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== 'contractVersion' || keys[1] !== 'verified') {
    throw new Error('Verifier result must contain only contractVersion and verified.');
  }
  if (record.contractVersion !== 1) {
    throw new Error(`Unsupported verifier result contract version: ${String(record.contractVersion)}`);
  }
  if (typeof record.verified !== 'boolean') {
    throw new Error('Verifier result field verified must be boolean.');
  }
  return { contractVersion: 1, verified: record.verified };
}
