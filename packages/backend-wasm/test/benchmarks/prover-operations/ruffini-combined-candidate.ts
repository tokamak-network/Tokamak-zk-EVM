import {
  BivariatePolynomialBuffer,
  type BivariateBufferRuffiniDivisionResult,
  type FieldElement,
} from "../../../src/index.js";

export function divideRuffiniRowMajorRawBuffer(
  polynomial: BivariatePolynomialBuffer,
  xPoint: FieldElement,
  yPoint: FieldElement,
): BivariateBufferRuffiniDivisionResult {
  const field = polynomial.field;
  const elementBytes = field.byteLength;
  if (xPoint.byteLength !== elementBytes || yPoint.byteLength !== elementBytes) {
    throw new Error("Ruffini division points must be field elements.");
  }

  const quotientXBuffer = field.createZeroBuffer(polynomial.xSize * polynomial.ySize);
  const xRemainderBuffer = field.createZeroBuffer(polynomial.ySize);

  if (polynomial.xSize === 1) {
    xRemainderBuffer.set(polynomial.coefficients);
  } else {
    const highestInputOffset = (polynomial.xSize - 1) * polynomial.ySize * elementBytes;
    const highestQuotientOffset = (polynomial.xSize - 2) * polynomial.ySize * elementBytes;
    quotientXBuffer.set(
      polynomial.coefficients.subarray(highestInputOffset, highestInputOffset + polynomial.ySize * elementBytes),
      highestQuotientOffset,
    );

    for (let x = polynomial.xSize - 3; x >= 0; x -= 1) {
      const inputRowOffset = (x + 1) * polynomial.ySize * elementBytes;
      const nextQuotientRowOffset = (x + 1) * polynomial.ySize * elementBytes;
      const quotientRowOffset = x * polynomial.ySize * elementBytes;
      for (let y = 0; y < polynomial.ySize; y += 1) {
        const elementOffset = y * elementBytes;
        quotientXBuffer.set(
          field.add(
            polynomial.coefficients.subarray(
              inputRowOffset + elementOffset,
              inputRowOffset + elementOffset + elementBytes,
            ),
            field.mul(
              xPoint,
              quotientXBuffer.subarray(
                nextQuotientRowOffset + elementOffset,
                nextQuotientRowOffset + elementOffset + elementBytes,
              ),
            ),
          ),
          quotientRowOffset + elementOffset,
        );
      }
    }

    for (let y = 0; y < polynomial.ySize; y += 1) {
      const elementOffset = y * elementBytes;
      xRemainderBuffer.set(
        field.add(
          polynomial.coefficients.subarray(elementOffset, elementOffset + elementBytes),
          field.mul(
            xPoint,
            quotientXBuffer.subarray(elementOffset, elementOffset + elementBytes),
          ),
        ),
        elementOffset,
      );
    }
  }

  const quotientYBuffer = field.createZeroBuffer(polynomial.ySize);
  let remainder: FieldElement;
  if (polynomial.ySize === 1) {
    remainder = xRemainderBuffer.slice(0, elementBytes);
  } else {
    quotientYBuffer.set(
      xRemainderBuffer.subarray(
        (polynomial.ySize - 1) * elementBytes,
        polynomial.ySize * elementBytes,
      ),
      (polynomial.ySize - 2) * elementBytes,
    );
    for (let y = polynomial.ySize - 3; y >= 0; y -= 1) {
      const sourceOffset = (y + 1) * elementBytes;
      quotientYBuffer.set(
        field.add(
          xRemainderBuffer.subarray(sourceOffset, sourceOffset + elementBytes),
          field.mul(
            yPoint,
            quotientYBuffer.subarray(sourceOffset, sourceOffset + elementBytes),
          ),
        ),
        y * elementBytes,
      );
    }
    remainder = field.add(
      xRemainderBuffer.subarray(0, elementBytes),
      field.mul(yPoint, quotientYBuffer.subarray(0, elementBytes)),
    );
  }

  return {
    quotientX: BivariatePolynomialBuffer.fromOwnedBuffer(
      field,
      quotientXBuffer,
      polynomial.xSize,
      polynomial.ySize,
    ),
    quotientY: BivariatePolynomialBuffer.fromOwnedBuffer(field, quotientYBuffer, 1, polynomial.ySize),
    remainder,
  };
}
