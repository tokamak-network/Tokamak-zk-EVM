import { Address } from "@ethereumjs/util"

export type RootSequencesBySlot = Record<number, bigint[]>
export type L1Address = Address
export type L2Address = Address