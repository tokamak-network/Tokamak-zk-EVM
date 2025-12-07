import { TokamakL2StateManagerOpts } from "./types.ts";
import { TokamakL2StateManager } from "./TokamakL2StateManager.ts";
import { MAX_MT_LEAVES } from "@tokamak-zk-evm/qap-compiler";


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

    const stateManager = new TokamakL2StateManager(opts)

    await stateManager.initTokamakExtendsFromRPC(rpcUrl, opts)
    return stateManager
}
