import type { G1Point, G2Point } from "./group.js";

export interface PairingTerm {
  readonly g1: G1Point;
  readonly g2: G2Point;
}
