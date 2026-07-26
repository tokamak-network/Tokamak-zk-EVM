import type { FieldElement, FieldRuntime } from "../../runtime/field/field-runtime.js";

export interface VerifierPublicPolynomial {
  evaluate(point: FieldElement): FieldElement;
}

export async function createVerifierPublicPolynomial(
  field: FieldRuntime,
  evaluations: readonly FieldElement[],
): Promise<VerifierPublicPolynomial> {
  if (!isPowerOfTwo(evaluations.length)) {
    throw new Error("Verifier public polynomial evaluation count must be a positive power of two.");
  }

  const coefficients = await field.ifft(evaluations);

  return {
    evaluate(point) {
      let result = field.zero;
      for (let index = coefficients.length - 1; index >= 0; index -= 1) {
        result = field.add(coefficients[index], field.mul(result, point));
      }
      return result;
    },
  };
}

function isPowerOfTwo(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && (value & (value - 1)) === 0;
}
