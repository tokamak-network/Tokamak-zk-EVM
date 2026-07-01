import type { BinarySectionEncoding, BinarySectionType } from "../../serialization/binary-format.js";

export interface SigmaVerifyFormatSpec {
  readonly schemaVersion: 1;
  readonly name: "sigma_verify";
  readonly sections: readonly SigmaVerifySectionSpec[];
}

export interface SigmaVerifySectionSpec {
  readonly label: string;
  readonly type: BinarySectionType;
  readonly encoding: BinarySectionEncoding;
  readonly elementCount: number;
  readonly points: readonly SigmaVerifyPointSpec[];
}

export interface SigmaVerifyPointSpec {
  readonly index: number;
  readonly name: string;
}
