import { BlockHeader, HeaderData, createBlockHeader } from "@ethereumjs/block";
import { addHexPrefix, Address, bigIntToBytes, createAddressFromString, hexToBytes, setLengthLeft } from "@ethereumjs/util";
import { getBlockHeaderFromRPC } from "../../synthesizer/src/tokamak/utils/provider";
import { keccak256, solidityPacked } from "ethers";

export async function fetchBlockHeaderFromRPC(blockNumber: number, rpcUrl: string): Promise<HeaderData> {
  return await getBlockHeaderFromRPC(rpcUrl, blockNumber)
}

export function pairL1L2Address(L1Addrs: string[], L2Addrs: string[]): {
    addrPairFromL1ToL2: Map<string, Address>, 
    addrPairFromL2ToL1: Map<string, Address>
} {
    const strToAddr = (addrStr: string): Address => {
        return createAddressFromString(addHexPrefix(addrStr))
    }
    const fromL1ToL2 = new Map<string, Address>()
    const fromL2ToL1 = new Map<string, Address>()
    if (!checkAddressDuplication(L1Addrs, L2Addrs)) {
        throw new Error("Address duplication or length mismatch.");
    }
    for (const [idx, L1Addr] of L1Addrs.entries()) {
        fromL1ToL2.set(L1Addr, strToAddr(L2Addrs[idx]))
        fromL2ToL1.set(L2Addrs[idx], strToAddr(L1Addr))
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

export function getStorageKey(parts: Array<Address | number | bigint | string>): Uint8Array {
    const bytesArray: Uint8Array[] = [];
  
    for (const p of parts) {
      let b: Uint8Array;
  
      if (p instanceof Address) {
        b = p.toBytes();
      } else if (typeof p === 'number') {
        b = bigIntToBytes(BigInt(p));
      } else if (typeof p === 'bigint') {
        b = bigIntToBytes(p);
      } else if (typeof p === 'string') {
        b = hexToBytes(addHexPrefix(p));
      } else {
        throw new Error('getStorageKey accepts only Address | number | bigint | string');
      }
  
      bytesArray.push(setLengthLeft(b, 32));
    }
  
    const packed = solidityPacked(Array(parts.length).fill('bytes'), bytesArray);
    const keyHex = keccak256(packed);          // 0x-prefixed string
    return hexToBytes(addHexPrefix(keyHex));
  }