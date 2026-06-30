import type { FieldElement } from "../runtime/field.js";

export interface DensePolynomial {
  readonly xSize: number;
  readonly ySize: number;
  readonly coefficients: readonly FieldElement[];
}
