import type {
  BinaryBundleKind,
  BinarySectionEncoding,
  BinarySectionType,
  BinarySectionView,
} from "../serialization/binary-format.js";

export type NativeArtifactJson = Record<string, unknown>;

export interface RuntimeArtifactBundle {
  readonly kind: BinaryBundleKind;
  readonly byteLength: number;
  readonly sections: readonly BinarySectionView[];
}

export interface RuntimeArtifactSectionQuery {
  readonly type: BinarySectionType;
  readonly encoding?: BinarySectionEncoding;
  readonly label?: string;
}
