import { Common } from "@ethereumjs/common";
import { AddressLike } from "@ethereumjs/util";

export type TokamakL2StateManagerOpts = {
    common: Common,
    blockNumber: number,
    contractAddress: AddressLike,
    initStorageKeys: {
        L1: Uint8Array,
        L2: Uint8Array,
    }[],
}