import { Common } from "@ethereumjs/common";
import { Address } from "@ethereumjs/util";

export type TokamakL2StateManagerOpts = {
    common: Common,
    contractAddress: Address,
    blockNumber?: number,
    initStorageKeys?: {
        L1: Uint8Array,
        L2: Uint8Array,
    }[],
    contractCode?: string,
}

// StateSnapshot type definition (matches usage in adapter)
export type StateSnapshot = {
  stateRoot: string;
  registeredKeys: string[];
  storageEntries: Array<{ key: string; value: string }>;
  contractAddress: string;
  preAllocatedLeaves: Array<{ key: string; value: string }>;
  channelId: number;
}