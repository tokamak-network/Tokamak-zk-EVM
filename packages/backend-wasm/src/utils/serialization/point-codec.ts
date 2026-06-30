import type { G1Point, G2Point } from "../../libs/runtime/group.js";

export interface PointCodec {
  parseG1(value: unknown): G1Point;
  parseG2(value: unknown): G2Point;
  formatG1(value: G1Point): unknown;
  formatG2(value: G2Point): unknown;
}
