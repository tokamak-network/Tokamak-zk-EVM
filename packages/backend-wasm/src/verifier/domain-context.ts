import type { FieldElement, FieldRuntime } from "../libs/runtime/field.js";
import type { VerifierChallenges } from "./challenges.js";

export interface VerifierDomainContext {
  readonly mI: number;
  readonly omegaMI: FieldElement;
  readonly omegaSMax: FieldElement;
  readonly tNEval: FieldElement;
  readonly tMIEval: FieldElement;
  readonly tSMaxEval: FieldElement;
}

export interface VerifierSetupParams {
  readonly l_free: number;
  readonly l: number;
  readonly l_user_out: number;
  readonly l_user: number;
  readonly l_D: number;
  readonly m_D: number;
  readonly n: number;
  readonly s_D: number;
  readonly s_max: number;
}

export function buildDomainContext(
  field: FieldRuntime,
  setup: VerifierSetupParams,
  challenges: VerifierChallenges,
): VerifierDomainContext {
  validateSetupParams(setup);
  const mI = setup.l_D - setup.l;

  return {
    mI,
    omegaMI: field.rootOfUnity(mI),
    omegaSMax: field.rootOfUnity(setup.s_max),
    tNEval: field.sub(field.pow(challenges.chi, setup.n), field.one),
    tMIEval: field.sub(field.pow(challenges.chi, mI), field.one),
    tSMaxEval: field.sub(field.pow(challenges.zeta, setup.s_max), field.one),
  };
}

function validateSetupParams(setup: VerifierSetupParams): void {
  if (setup.l_D < setup.l) {
    throw new Error("Invalid setup params: l_D must be greater than or equal to l.");
  }

  if (!isPowerOfTwo(setup.n) || !isPowerOfTwo(setup.s_max) || !isPowerOfTwo(setup.l_D - setup.l)) {
    throw new Error("Verifier setup domain sizes must be powers of two.");
  }
}

function isPowerOfTwo(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && (value & (value - 1)) === 0;
}
