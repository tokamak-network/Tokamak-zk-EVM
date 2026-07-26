import type { FieldElement } from "../field/field-runtime.js";

export interface LagrangeEvaluation {
  readonly index: number;
  readonly value: FieldElement;
}
