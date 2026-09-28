import type { G1Point, G2Point } from "../group/group.js";
import type { FfCurve } from "../curve/curve.js";
import type { G1Runtime } from "../group/group.js";

export interface PairingTerm {
  readonly g1: G1Point;
  readonly g2: G2Point;
}
export interface PairingRuntime {
  prepareG2(point: G2Point): Uint8Array;
  preparedProductIsOne(terms: readonly {
    readonly g1: G1Point;
    readonly preparedG2: Uint8Array;
  }[]): boolean;
  productsEqual(left: readonly PairingTerm[], right: readonly PairingTerm[]): Promise<boolean>;
}
export function createPairingRuntime(curve: FfCurve, g1: G1Runtime): PairingRuntime {
  return {
    prepareG2(point) { return curve.prepareG2(curve.G2.toJacobian(point)); },
    preparedProductIsOne(terms) {
      let product = curve.Gt.one;
      for(const term of terms) {
        const p = curve.prepareG1(curve.G1.toJacobian(term.g1));
        product = curve.Gt.mul(product, curve.millerLoop(p, term.preparedG2));
      }
      return curve.Gt.eq(curve.finalExponentiation(product), curve.Gt.one);
    },
    async productsEqual(left, right) {
      const terms: Uint8Array[] = [];
      for(const term of left) {
        terms.push(term.g1, term.g2);
      }
      for(const term of right) {
        terms.push(g1.neg(term.g1), term.g2);
      }
      return curve.pairingEq(...terms);
    },
  };
}
