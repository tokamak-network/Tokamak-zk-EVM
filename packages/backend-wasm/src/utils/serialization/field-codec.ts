import type { FieldElement } from "../../libs/runtime/field.js";

export interface FieldCodec {
  parse(value: string): FieldElement;
  format(value: FieldElement): string;
}
