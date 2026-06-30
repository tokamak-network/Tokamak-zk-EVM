import type { FieldElement } from "../runtime/field.js";

export interface EvaluationDomain {
  readonly size: number;
  readonly rootOfUnity: FieldElement;
}
