import type { PairingTerm } from "../libs/runtime/pairing.js";

export interface PairingProductCheck {
  readonly left: readonly PairingTerm[];
  readonly right: readonly PairingTerm[];
}
