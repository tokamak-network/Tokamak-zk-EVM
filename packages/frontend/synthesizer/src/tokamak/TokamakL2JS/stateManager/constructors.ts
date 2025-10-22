import { Common } from "@ethereumjs/common";
import { MerkleStateManager } from "@ethereumjs/statemanager";
import { addHexPrefix, Address, AddressLike, bigIntToBytes, bytesToBigInt, concatBytes, createAccount, hexToBytes, setLengthLeft, toBytes } from "@ethereumjs/util";
import { ethers } from "ethers";
import { poseidon } from "../crypto/index.ts";
import { getTokamakL2UserStorageKey } from "../utils/index.ts";
import { TokamakL2StateManagerOpts } from "./types.ts";
import { MAX_MT_LEAVES, POSEIDON_INPUTS, poseidon_raw } from "src/tokamak/constant/constants.ts";
import { TokamakL2StateManager } from "./TokamakL2StateManager.ts";
import { IMTHashFunction, IMTNode } from "@zk-kit/imt";


export async function createTokamakL2StateManagerFromL1RPC(
    rpcUrl: string,
    opts: TokamakL2StateManagerOpts,
): Promise<TokamakL2StateManager> {
    if (opts.userStorageSlots.length * opts.userL2Addresses.length > MAX_MT_LEAVES) {
        throw new Error(`Allowed maximum number of storage slots = ${MAX_MT_LEAVES}, but taking ${opts.userStorageSlots.length} * ${opts.userL2Addresses.length}`)
    }
    if (opts.userL1Addresses.length !== opts.userL2Addresses.length) {
        throw new Error('Required one-to-one pairings between L1 and L2 addresses')
    }
    
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const contractAddress = new Address(toBytes(opts.contractAddress))
    const userL1Addresses = opts.userL1Addresses.map(addr => new Address(toBytes(addr)))
    const userL2Addresses = opts.userL2Addresses.map(addr => new Address(toBytes(addr)))
    
    const stateManager = new TokamakL2StateManager({common: opts.common})
    const contractAccount = createAccount({})
    await stateManager.putAccount(contractAddress, contractAccount)
    const byteCodeStr = await provider.getCode(contractAddress.toString(), opts.blockNumber)
    await stateManager.putCode(contractAddress, hexToBytes(addHexPrefix(byteCodeStr)))
    
    const registeredKeys: Uint8Array[] = []
    for (const [idx, L1Addr] of userL1Addresses.entries()) {
        for (const slot of opts.userStorageSlots){
            const L1key = getTokamakL2UserStorageKey([L1Addr, slot])
            const v   = await provider.getStorage(contractAddress.toString(), bytesToBigInt(L1key), opts.blockNumber)
            const vBytes = hexToBytes(addHexPrefix(v))
            const L2key = getTokamakL2UserStorageKey([userL2Addresses[idx], slot])
            await stateManager.putStorage(contractAddress, L2key, vBytes)
            registeredKeys.push(L2key)
        }
    }
    stateManager.initRegisteredKeys(registeredKeys)
    stateManager.initCachedOpts(opts)
    return stateManager
}
