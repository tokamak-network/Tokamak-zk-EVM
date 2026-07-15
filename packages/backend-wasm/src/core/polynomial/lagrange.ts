import type { FieldElement } from "../field/field.js";

export interface LagrangeEvaluation {
  readonly index: number;
  readonly value: FieldElement;
}
