import type { DB, VerkleCrypto } from '@synthesizer-libs/util';
export interface Fr {
}
export type Proof = Uint8Array[];
export interface VerkleTreeOpts {
    /**
     * An instantiated Verkle Cryptography interface
     */
    verkleCrypto: VerkleCrypto;
    /**
     * A database instance.
     */
    db: DB<Uint8Array, Uint8Array>;
    /**
     * A `Uint8Array` for the root of a previously stored tree
     */
    root?: Uint8Array;
    /**
     * Store the root inside the database after every `write` operation
     */
    useRootPersistence: boolean;
    /**
     * LRU cache for tree nodes to allow for faster node retrieval.
     *
     * Default: 0 (deactivated)
     */
    cacheSize: number;
}
export interface CheckpointDBOpts {
    /**
     * A database instance.
     */
    db: DB<Uint8Array, Uint8Array>;
    /**
     * Cache size (default: 0)
     */
    cacheSize?: number;
}
export type Checkpoint = {
    keyValueMap: Map<string, Uint8Array | undefined>;
    root: Uint8Array;
};
export declare const ROOT_DB_KEY: Uint8Array;
//# sourceMappingURL=types.d.ts.map