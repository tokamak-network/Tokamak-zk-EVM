import { Common } from "@ethereumjs/common";
import { AddressLike } from "@ethereumjs/util";

export type TokamakL2StateManagerOpts = {
    common: Common,
    blockNumber: number,
    contractAddress: AddressLike,
    userStorageSlots: number[],
    userL1Addresses: AddressLike[],
    userL2Addresses: AddressLike[],
}