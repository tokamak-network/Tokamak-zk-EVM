import type { FieldElement } from "../runtime/field.js";

export interface LagrangeEvaluation {
  readonly index: number;
  readonly value: FieldElement;
}
