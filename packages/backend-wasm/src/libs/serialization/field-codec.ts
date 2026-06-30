import type { FieldElement } from "../runtime/field.js";

export interface FieldCodec {
  parse(value: string): FieldElement;
  format(value: FieldElement): string;
}
