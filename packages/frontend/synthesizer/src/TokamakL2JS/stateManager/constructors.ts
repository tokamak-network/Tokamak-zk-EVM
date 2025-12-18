import { TokamakL2StateManagerOpts } from "./types.ts";
import { TokamakL2StateManager } from "./TokamakL2StateManager.ts";
import { IMTHashFunction, IMTNode } from "@zk-kit/imt";
import { MAX_MT_LEAVES } from "../../interface/qapCompiler/importedConstants.ts";


export async function createTokamakL2StateManagerFromL1RPC(
    rpcUrl: string,
    opts: TokamakL2StateManagerOpts,
): Promise<TokamakL2StateManager> {
    if (opts.initStorageKeys.length > MAX_MT_LEAVES) {
        throw new Error(`Allowed maximum number of storage slots = ${MAX_MT_LEAVES}, but taking ${opts.initStorageKeys.length}`)
    }

    const stateManager = new TokamakL2StateManager(opts)
    
    await stateManager.initTokamakExtendsFromRPC(rpcUrl, opts)
    return stateManager
}
