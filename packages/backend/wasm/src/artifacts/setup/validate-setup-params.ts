import type { SetupParams } from "./setup-params.js";

const NUMERIC_SETUP_FIELDS = ["n", "m", "m_b", "t", "s"] as const;

/** Validates the normalized setup capacities required by every browser path. */
export function validateSetupParams(setup: SetupParams): void {
  for (const field of NUMERIC_SETUP_FIELDS) {
    if (!isPowerOfTwo(setup[field])) {
      throw new Error(`Setup parameter '${field}' must be a positive power of two.`);
    }
  }
  if (setup.m_b > setup.m) {
    throw new Error("Setup wiring capacity m_b must not exceed local wire capacity m.");
  }
  if (!Array.isArray(setup.publicWirePhases)) {
    throw new Error("Setup publicWirePhases must be an array.");
  }
}

function isPowerOfTwo(value: number): boolean {
  if (!Number.isSafeInteger(value) || value <= 0) return false;
  let remaining = value;
  while (remaining % 2 === 0) remaining /= 2;
  return remaining === 1;
}
