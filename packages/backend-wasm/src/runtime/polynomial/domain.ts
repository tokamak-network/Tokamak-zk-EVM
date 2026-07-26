import type { FieldElement } from "../field/field-runtime.js";

export interface EvaluationDomain {
  readonly size: number;
  readonly rootOfUnity: FieldElement;
}
