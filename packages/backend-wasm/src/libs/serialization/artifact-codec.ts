import type { BinaryBundleKind, BinarySectionInput } from "./binary-format.js";

export interface ArtifactCodec {
  readonly kind: BinaryBundleKind;
  readonly sections: readonly BinarySectionInput[];
}
