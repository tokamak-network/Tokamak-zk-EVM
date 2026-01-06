import { StateSnapshot, TokamakL2StateManagerOpts } from "./types.ts";
import { TokamakL2StateManager } from "./TokamakL2StateManager.ts";
import { IMTHashFunction, IMTNode } from "@zk-kit/imt";
import { MAX_MT_LEAVES } from "../../interface/qapCompiler/importedConstants.ts";


export async function createTokamakL2StateManagerFromL1RPC(
    rpcUrl: string,
    opts: TokamakL2StateManagerOpts,
): Promise<TokamakL2StateManager> {
    if (opts.initStorageKeys === undefined) {
        throw new Error('Creating TokamakL2StateManager using StateSnapshot requires L1 and L2 key pairs.')
    }
    if (opts.initStorageKeys.length > MAX_MT_LEAVES) {
        throw new Error(`Allowed maximum number of storage slots = ${MAX_MT_LEAVES}, but taking ${opts.initStorageKeys.length}`)
    }

    const stateManager = new TokamakL2StateManager(opts);
    
    await stateManager.initTokamakExtendsFromRPC(rpcUrl, opts);
    return stateManager
}

export async function createTokamakL2StateManagerFromStateSnapshot(
    snapshot: StateSnapshot,
    opts: TokamakL2StateManagerOpts,
): Promise<TokamakL2StateManager> {
    if (snapshot.registeredKeys.length > MAX_MT_LEAVES) {
        throw new Error(`Allowed maximum number of storage slots = ${MAX_MT_LEAVES}, but taking ${snapshot.registeredKeys.length}`)
    }

    const stateManager = new TokamakL2StateManager(opts);
    
    await stateManager.initTokamakExtendsFromSnapshot(snapshot, opts);
    return stateManager
}