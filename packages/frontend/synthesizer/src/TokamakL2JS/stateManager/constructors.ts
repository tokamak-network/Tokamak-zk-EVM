import { TokamakL2StateManagerOpts } from "./types.ts";
import { TokamakL2StateManager } from "./TokamakL2StateManager.ts";
import { IMTHashFunction, IMTNode } from "@zk-kit/imt";
import { MAX_MT_LEAVES } from "../../interface/qapCompiler/importedConstants.ts";


export async function createTokamakL2StateManagerFromL1RPC(
    rpcUrl: string,
    opts: TokamakL2StateManagerOpts,
    skipInit: boolean = false,
): Promise<TokamakL2StateManager> {
    if (!skipInit) {
        if (opts.userStorageSlots.length * opts.userL2Addresses.length > MAX_MT_LEAVES) {
            throw new Error(`Allowed maximum number of storage slots = ${MAX_MT_LEAVES}, but taking ${opts.userStorageSlots.length} * ${opts.userL2Addresses.length}`)
        }
        if (opts.userL1Addresses.length !== opts.userL2Addresses.length) {
            throw new Error('Required one-to-one pairings between L1 and L2 addresses')
        }
    }

    const stateManager = new TokamakL2StateManager(opts)

    if (!skipInit) {
        await stateManager.initTokamakExtendsFromRPC(rpcUrl, opts)
    } else {
        // Even when skipping init, we need to set cachedOpts for createStateFromSnapshot
        // This allows createStateFromSnapshot to access common.customCrypto.keccak256
        stateManager.setCachedOpts(opts)
    }
    return stateManager
}
