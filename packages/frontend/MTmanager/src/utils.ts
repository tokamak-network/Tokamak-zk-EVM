import { BlockHeader, HeaderData, createBlockHeader } from "@ethereumjs/block";
import { addHexPrefix, Address, createAddressFromString } from "@ethereumjs/util";
import { getBlockHeaderFromRPC } from "../../synthesizer/src/tokamak/utils/provider";

export async function fetchBlockHeaderFromRPC(blockNumber: number, rpcUrl: string): Promise<HeaderData> {
  return await getBlockHeaderFromRPC(rpcUrl, blockNumber)
}

export function pairL1L2Address(L1Addrs: string[], L2Addrs: string[]): {
    addrPairFromL1ToL2: Map<Address, Address>, 
    addrPairFromL2ToL1: Map<Address, Address>
} {
    const strToAddr = (addrStr: string): Address => {
        return createAddressFromString(addHexPrefix(addrStr))
    }
    const fromL1ToL2 = new Map<Address, Address>()
    const fromL2ToL1 = new Map<Address, Address>()
    if (checkAddressDuplication(L1Addrs, L2Addrs)) {
        throw new Error("Address duplication or length mismatch.");
    }
    for (const [idx, L1Addr] of L1Addrs.entries()) {
        fromL1ToL2.set(strToAddr(L1Addr), strToAddr(L2Addrs[idx]))
        fromL2ToL1.set(strToAddr(L2Addrs[idx]), strToAddr(L1Addr))
    }
    
    return {
        addrPairFromL1ToL2: fromL1ToL2,
        addrPairFromL2ToL1: fromL2ToL1,
    }
}

function checkAddressDuplication(L1Addrs: string[], L2Addrs: string[]): boolean {
        const L1AddrSet = new Set(L1Addrs);
        if (L1AddrSet.size !== L1Addrs.length) return false;
        const L2AddrSet = new Set(L2Addrs);
        if (L2AddrSet.size !== L2Addrs.length) return false;
        if (L1Addrs.length !== L2Addrs.length) return false;
        return true;
    }