import { BivariatePolynomialBuffer } from "../../../src/runtime/polynomial/bivariate-polynomial-buffer.js";
import { DensePolynomialExt } from "./dense-polynomial.js";

export function bivariateBufferFromDense(
  polynomial: DensePolynomialExt,
): BivariatePolynomialBuffer {
  return BivariatePolynomialBuffer.fromCoeffs(
    polynomial.field,
    polynomial.coefficients,
    polynomial.xSize,
    polynomial.ySize,
  );
}

export function denseFromBivariateBuffer(
  polynomial: BivariatePolynomialBuffer,
): DensePolynomialExt {
  return DensePolynomialExt.fromCoeffs(
    polynomial.field,
    polynomial.field.split(polynomial.coefficients),
    polynomial.xSize,
    polynomial.ySize,
  );
}

export function bivariateBufferToHexCoeffs(
  polynomial: BivariatePolynomialBuffer,
): readonly string[] {
  return polynomial.field
    .split(polynomial.coefficients)
    .map((coefficient) => polynomial.field.toHex(coefficient));
}
