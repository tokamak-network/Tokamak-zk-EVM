import type { FieldElement } from "../libs/runtime/field.js";

export interface VerifierChallenges {
  readonly values: readonly FieldElement[];
}
