import type { FieldElement, FieldRuntime } from "../runtime/field.js";
import { biNtt } from "./dense-polynomial.js";

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
