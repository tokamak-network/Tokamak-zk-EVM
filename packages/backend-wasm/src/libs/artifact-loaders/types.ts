import type {
  BinaryArtifactFileKind,
  BinaryDigestEntryView,
  BinarySectionEncoding,
  BinarySectionType,
  BinarySectionView,
} from "../serialization/binary-format.js";

export interface RuntimeArtifactFile {
  readonly kind: BinaryArtifactFileKind;
  readonly formatVersion: number;
  readonly sourcePackageVersion: string;
  readonly byteLength: number;
  readonly digests: readonly BinaryDigestEntryView[];
  readonly sections: readonly BinarySectionView[];
}

export interface RuntimeArtifactSectionQuery {
  readonly type: BinarySectionType;
  readonly encoding?: BinarySectionEncoding;
  readonly label?: string;
}
