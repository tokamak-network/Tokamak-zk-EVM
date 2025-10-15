import { Common } from "@ethereumjs/common"
import { Address } from "@ethereumjs/util"
import { EdwardsPoint } from "@noble/curves/abstract/edwards"

export interface TokamakL2TxMsg {
  nonce: bigint
  to: Address
  functionSelector: bigint
  functionInputs: [
    bigint, bigint, bigint,
    bigint, bigint, bigint,
    bigint, bigint, bigint,
  ]
}

export interface EddsaSignature {
  eddsaSign: bigint
  eddsaRand: EdwardsPoint
}