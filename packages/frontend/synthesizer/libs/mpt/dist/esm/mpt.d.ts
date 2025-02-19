import { Lock, ValueEncoding } from '@ethereumjs/util';
import { CheckpointDB } from './db/index.js';
import type { BranchMPTNodeBranchValue, FoundNodeFunction, MPTNode, MPTOpts, MPTOptsWithDefaults, Nibbles, NodeReferenceOrRawMPTNode, Path, TrieShallowCopyOpts } from './types.js';
import type { OnFound } from './util/asyncWalk.js';
import type { BatchDBOp, DB } from '@ethereumjs/util';
import type { Debugger } from 'debug';
/**
 * The basic trie interface, use with `import { MerklePatriciaTrie } from '@synthesizer-libs/mpt'`.
 */
export declare class MerklePatriciaTrie {
    protected readonly _opts: MPTOptsWithDefaults;
    /** The root for an empty trie */
    EMPTY_TRIE_ROOT: Uint8Array;
    /** The backend DB */
    protected _db: CheckpointDB;
    protected _hashLen: number;
    protected _lock: Lock;
    protected _root: Uint8Array;
    /** Debug logging */
    protected DEBUG: boolean;
    protected _debug: Debugger;
    protected debug: (...args: any) => void;
    /**
     * Creates a new trie.
     * @param opts Options for instantiating the trie
     *
     * Note: in most cases, {@link createMPT} constructor should be used.  It uses the same API but provides sensible defaults
     */
    constructor(opts?: MPTOpts);
    database(db?: DB<string, string | Uint8Array>, valueEncoding?: ValueEncoding): CheckpointDB;
    /**
     * Gets and/or Sets the current root of the `trie`
     */
    root(value?: Uint8Array | null): Uint8Array;
    /**
     * Checks if a given root exists.
     */
    checkRoot(root: Uint8Array): Promise<boolean>;
    /**
     * Gets a value given a `key`
     * @param key - the key to search for
     * @param throwIfMissing - if true, throws if any nodes are missing. Used for verifying proofs. (default: false)
     * @returns A Promise that resolves to `Uint8Array` if a value was found or `null` if no value was found.
     */
    get(key: Uint8Array, throwIfMissing?: boolean): Promise<Uint8Array | null>;
    /**
     * Stores a given `value` at the given `key` or do a delete if `value` is empty
     * (delete operations are only executed on DB with `deleteFromDB` set to `true`)
     * @param key
     * @param value
     * @returns A Promise that resolves once value is stored.
     */
    put(key: Uint8Array, value: Uint8Array | null, skipKeyTransform?: boolean): Promise<void>;
    /**
     * Deletes a value given a `key` from the trie
     * (delete operations are only executed on DB with `deleteFromDB` set to `true`)
     * @param key
     * @returns A Promise that resolves once value is deleted.
     */
    del(key: Uint8Array, skipKeyTransform?: boolean): Promise<void>;
    /**
     * Tries to find a path to the node for the given key.
     * It returns a `stack` of nodes to the closest node.
     * @param key - the search key
     * @param throwIfMissing - if true, throws if any nodes are missing. Used for verifying proofs. (default: false)
     */
    findPath(key: Uint8Array, throwIfMissing?: boolean, partialPath?: {
        stack: MPTNode[];
    }): Promise<Path>;
    /**
     * Walks a trie until finished.
     * @param root
     * @param onFound - callback to call when a node is found. This schedules new tasks. If no tasks are available, the Promise resolves.
     * @returns Resolves when finished walking trie.
     */
    walkTrie(root: Uint8Array, onFound: FoundNodeFunction): Promise<void>;
    walkTrieIterable: (nodeHash: Uint8Array, currentKey?: number[] | undefined, onFound?: OnFound | undefined, filter?: import("./util/asyncWalk.js").NodeFilter | undefined, visited?: Set<string> | undefined) => AsyncIterable<{
        node: MPTNode;
        currentKey: number[];
    }>;
    /**
     * Executes a callback for each node in the trie.
     * @param onFound - callback to call when a node is found.
     * @returns Resolves when finished walking trie.
     */
    walkAllNodes(onFound: OnFound): Promise<void>;
    /**
     * Executes a callback for each value node in the trie.
     * @param onFound - callback to call when a node is found.
     * @returns Resolves when finished walking trie.
     */
    walkAllValueNodes(onFound: OnFound): Promise<void>;
    /**
     * Creates the initial node from an empty tree.
     * @private
     */
    protected _createInitialNode(key: Uint8Array, value: Uint8Array): Promise<void>;
    /**
     * Retrieves a node from db by hash.
     */
    lookupNode(node: Uint8Array | Uint8Array[]): Promise<MPTNode>;
    /**
     * Updates a node.
     * @private
     * @param key
     * @param value
     * @param keyRemainder
     * @param stack
     */
    protected _updateNode(k: Uint8Array, value: Uint8Array, keyRemainder: Nibbles, stack: MPTNode[]): Promise<void>;
    /**
     * Deletes a node from the trie.
     * @private
     */
    protected _deleteNode(k: Uint8Array, stack: MPTNode[]): Promise<void>;
    /**
     * Saves a stack of nodes to the database.
     *
     * @param key - the key. Should follow the stack
     * @param stack - a stack of nodes to the value given by the key
     * @param opStack - a stack of levelup operations to commit at the end of this function
     */
    saveStack(key: Nibbles, stack: MPTNode[], opStack: BatchDBOp[]): Promise<void>;
    /**
     * Formats node to be saved by `levelup.batch`.
     * @private
     * @param node - the node to format.
     * @param topLevel - if the node is at the top level.
     * @param opStack - the opStack to push the node's data.
     * @param remove - whether to remove the node
     * @returns The node's hash used as the key or the rawNode.
     */
    _formatNode(node: MPTNode, topLevel: boolean, opStack: BatchDBOp[], remove?: boolean): Uint8Array | NodeReferenceOrRawMPTNode | BranchMPTNodeBranchValue[];
    /**
     * The given hash of operations (key additions or deletions) are executed on the trie
     * (delete operations are only executed on DB with `deleteFromDB` set to `true`)
     * @example
     * const ops = [
     *    { type: 'del', key: Uint8Array.from('father') }
     *  , { type: 'put', key: Uint8Array.from('name'), value: Uint8Array.from('Yuri Irsenovich Kim') } // cspell:disable-line
     *  , { type: 'put', key: Uint8Array.from('dob'), value: Uint8Array.from('16 February 1941') }
     *  , { type: 'put', key: Uint8Array.from('spouse'), value: Uint8Array.from('Kim Young-sook') } // cspell:disable-line
     *  , { type: 'put', key: Uint8Array.from('occupation'), value: Uint8Array.from('Clown') }
     * ]
     * await trie.batch(ops)
     * @param ops
     */
    batch(ops: BatchDBOp[], skipKeyTransform?: boolean): Promise<void>;
    verifyPrunedIntegrity(): Promise<boolean>;
    /**
     * Returns a copy of the underlying trie.
     *
     * Note on db: the copy will create a reference to the
     * same underlying database.
     *
     * Note on cache: for memory reasons a copy will by default
     * not recreate a new LRU cache but initialize with cache
     * being deactivated. This behavior can be overwritten by
     * explicitly setting `cacheSize` as an option on the method.
     *
     * @param includeCheckpoints - If true and during a checkpoint, the copy will contain the checkpointing metadata and will use the same scratch as underlying db.
     */
    shallowCopy(includeCheckpoints?: boolean, opts?: TrieShallowCopyOpts): MerklePatriciaTrie;
    /**
     * Persists the root hash in the underlying database
     */
    persistRoot(): Promise<void>;
    /**
     * Finds all nodes that are stored directly in the db
     * (some nodes are stored raw inside other nodes)
     * called by {@link ScratchReadStream}
     * @private
     */
    protected _findDbNodes(onFound: FoundNodeFunction): Promise<void>;
    /**
     * Returns the key practically applied for trie construction
     * depending on the `useKeyHashing` option being set or not.
     * @param key
     */
    protected appliedKey(key: Uint8Array): Uint8Array;
    protected hash(msg: Uint8Array): Uint8Array;
    /**
     * Is the trie during a checkpoint phase?
     */
    hasCheckpoints(): boolean;
    /**
     * Creates a checkpoint that can later be reverted to or committed.
     * After this is called, all changes can be reverted until `commit` is called.
     */
    checkpoint(): void;
    /**
     * Commits a checkpoint to disk, if current checkpoint is not nested.
     * If nested, only sets the parent checkpoint as current checkpoint.
     * @throws If not during a checkpoint phase
     */
    commit(): Promise<void>;
    /**
     * Reverts the trie to the state it was at when `checkpoint` was first called.
     * If during a nested checkpoint, sets root to most recent checkpoint, and sets
     * parent checkpoint as current.
     */
    revert(): Promise<void>;
    /**
     * Flushes all checkpoints, restoring the initial checkpoint state.
     */
    flushCheckpoints(): void;
    /**
     * Returns a list of values stored in the trie
     * @param startKey first unhashed key in the range to be returned (defaults to 0).  Note, all keys must be of the same length or undefined behavior will result
     * @param limit - the number of keys to be returned (undefined means all keys)
     * @returns an object with two properties (a map of all key/value pairs in the trie - or in the specified range) and then a `nextKey` reference if a range is specified
     */
    getValueMap(startKey?: bigint, limit?: number): Promise<{
        values: {
            [key: string]: string;
        };
        nextKey: null | string;
    }>;
}
//# sourceMappingURL=mpt.d.ts.map