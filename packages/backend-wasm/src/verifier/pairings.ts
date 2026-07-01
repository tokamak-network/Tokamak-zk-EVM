import type { PairingTerm } from "../libs/runtime/pairing.js";
import type { PairingRuntime } from "../libs/runtime/pairing.js";

export interface PairingProductCheck {
  readonly left: readonly PairingTerm[];
  readonly right: readonly PairingTerm[];
}

export function pairingProductsEqual(
  pairing: PairingRuntime,
  left: readonly PairingTerm[],
  right: readonly PairingTerm[],
): Promise<boolean> {
  return pairing.productsEqual(left, right);
}
