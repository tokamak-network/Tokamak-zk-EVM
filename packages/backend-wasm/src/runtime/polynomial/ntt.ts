import type { FieldElement, FieldRuntime } from "../field/field-runtime.js";

export type NttInput = readonly FieldElement[];

export function ntt1d(field: FieldRuntime, values: NttInput): Promise<FieldElement[]> {
  return field.fft(values);
}

export function intt1d(field: FieldRuntime, values: NttInput): Promise<FieldElement[]> {
  return field.ifft(values);
}

export function ntt2d(
  field: FieldRuntime,
  values: NttInput,
  xSize: number,
  ySize: number,
): Promise<FieldElement[]> {
  return biNtt(field, values, xSize, ySize, "forward");
}

export function intt2d(
  field: FieldRuntime,
  values: NttInput,
  xSize: number,
  ySize: number,
): Promise<FieldElement[]> {
  return biNtt(field, values, xSize, ySize, "inverse");
}

async function biNtt(
  field: FieldRuntime,
  values: readonly FieldElement[],
  xSize: number,
  ySize: number,
  direction: "forward" | "inverse",
): Promise<FieldElement[]> {
  validateShape(xSize, ySize);
  if (values.length !== xSize * ySize) {
    throw new Error("NTT input count does not match the bivariate shape.");
  }

  const transform = direction === "forward" ? field.fft.bind(field) : field.ifft.bind(field);
  if (xSize === 1 || ySize === 1) {
    return transform(values);
  }

  const yTransformed: FieldElement[] = Array.from({ length: values.length }, () => field.zero);
  for (let x = 0; x < xSize; x += 1) {
    const rowTransformed = await transform(values.slice(x * ySize, (x + 1) * ySize));
    for (let y = 0; y < ySize; y += 1) {
      yTransformed[x * ySize + y] = rowTransformed[y];
    }
  }

  const output: FieldElement[] = Array.from({ length: values.length }, () => field.zero);
  for (let y = 0; y < ySize; y += 1) {
    const column = Array.from({ length: xSize }, (_, x) => yTransformed[x * ySize + y]);
    const columnTransformed = await transform(column);
    for (let x = 0; x < xSize; x += 1) {
      output[x * ySize + y] = columnTransformed[x];
    }
  }

  return output;
}

function validateShape(xSize: number, ySize: number): void {
  if (!isPowerOfTwo(xSize) || !isPowerOfTwo(ySize)) {
    throw new Error("Bivariate polynomial sizes must be positive powers of two.");
  }
}

function isPowerOfTwo(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && (value & (value - 1)) === 0;
}
