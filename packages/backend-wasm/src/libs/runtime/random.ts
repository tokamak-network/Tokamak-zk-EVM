import type { FieldElement, FieldRuntime } from "./field.js";

export type RandomScalarSource = () => FieldElement | Promise<FieldElement>;

export function createRandomScalarSource(field: FieldRuntime): RandomScalarSource {
  return () => field.random();
}
