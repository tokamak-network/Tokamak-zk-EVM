import { Address } from "@ethereumjs/util"

export interface L2TxData {
  nonce: bigint
  to: Address
  functionSelector: bigint
  functionInputs: bigint[]
  eddsaSignature: EddsaSignature
}

export interface EddsaSignature {
    eddsaSign: bigint
    eddsaRand: {
        x: bigint,
        y: bigint
    }
}