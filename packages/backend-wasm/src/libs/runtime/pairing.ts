import type { G1Point, G2Point } from "./group.js";
import type { FfCurve } from "./curve.js";
import type { G1Runtime } from "./group.js";

export interface PairingTerm {
  readonly g1: G1Point;
  readonly g2: G2Point;
}

export interface PairingRuntime {
  productsEqual(left: readonly PairingTerm[], right: readonly PairingTerm[]): Promise<boolean>;
}

export function createPairingRuntime(curve: FfCurve, g1: G1Runtime): PairingRuntime {
  return {
    async productsEqual(left, right) {
      const terms: Uint8Array[] = [];

      for (const term of left) {
        terms.push(term.g1, term.g2);
      }

      for (const term of right) {
        terms.push(g1.neg(term.g1), term.g2);
      }

      return curve.pairingEq(...terms);
    },
  };
}
