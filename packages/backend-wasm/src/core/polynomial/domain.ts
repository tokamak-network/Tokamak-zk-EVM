import type { FieldElement } from "../field/field.js";

export interface EvaluationDomain {
  readonly size: number;
  readonly rootOfUnity: FieldElement;
}
