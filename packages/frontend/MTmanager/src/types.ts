import { Address } from "@ethereumjs/util"

export type RootBySlot = Record<number, bigint>
export type RootsByNonce = Record<number, RootBySlot>
export type L1Address = Address
export type L2Address = Address