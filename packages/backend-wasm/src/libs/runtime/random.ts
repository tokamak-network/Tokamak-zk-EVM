import type { FieldElement } from "./field.js";

export type RandomScalarSource = () => FieldElement | Promise<FieldElement>;
