import type { FieldElement } from "../runtime/field.js";

export interface ChallengeTranscript {
  squeezeChallenge(): FieldElement;
}
