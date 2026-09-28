export interface BinaryArtifactInspection {
  readonly kind: number;
  readonly formatVersion: number;
  readonly sourcePackageVersion: string;
  readonly byteLength: number;
  readonly selfDigestHex: string;
  readonly sections: readonly BinarySectionInspection[];
}

export interface BinarySectionInspection {
  readonly type: number;
  readonly encoding: number;
  readonly label: string;
  readonly elementCount: number;
  readonly elementByteLength: number;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly flags: number;
}
