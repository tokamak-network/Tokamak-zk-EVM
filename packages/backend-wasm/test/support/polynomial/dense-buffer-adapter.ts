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
    polynomial.toCoeffs(),
    polynomial.xSize,
    polynomial.ySize,
  );
}
