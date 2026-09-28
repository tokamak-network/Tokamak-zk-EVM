import {
  parseSubcircuitLibraryOrigin,
  type SubcircuitLibraryOrigin,
} from "../../src/generated/crs-provenance-validator.generated.js";

export type { SubcircuitLibraryOrigin } from "../../src/generated/crs-provenance-validator.generated.js";

export function readSelectedInputOrigin(args: readonly string[]): SubcircuitLibraryOrigin {
  const originFlags = args.filter((argument) => argument.startsWith("--origin="));
  if (originFlags.length > 1) {
    throw new Error("Specify subcircuit-library origin at most once.");
  }
  const origin = originFlags[0]?.slice("--origin=".length) ?? "localQapCompiler";
  return parseSubcircuitLibraryOrigin(origin, "Selected subcircuit-library origin");
}
