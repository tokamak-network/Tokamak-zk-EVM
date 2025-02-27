<<<<<<< HEAD
import { Lock } from '@ethereumjs/util';
import { CheckpointDB } from './db/checkpoint.js';
import { InternalVerkleNode } from './node/internalNode.js';
import { LeafVerkleNode } from './node/leafNode.js';
import { LeafVerkleNodeValue, type VerkleNode } from './node/types.js';
import { type Proof, type VerkleTreeOpts } from './types.js';
import type { VerkleCrypto } from '@ethereumjs/util';
import type { Debugger } from 'debug';
interface Path {
    node: VerkleNode | null;
    remaining: Uint8Array;
    stack: Array<[VerkleNode, Uint8Array]>;
}
/**
 * The basic verkle tree interface, use with `import { VerkleTree } from '@ethereumjs/verkle'`.
 */
export declare class VerkleTree {
    _opts: VerkleTreeOpts;
    /** The root for an empty tree */
    EMPTY_TREE_ROOT: Uint8Array;
    /** The backend DB */
    protected _db: CheckpointDB;
    protected _hashLen: number;
    protected _lock: Lock;
    protected _root: Uint8Array;
    protected verkleCrypto: VerkleCrypto;
    /** Debug logging */
    protected DEBUG: boolean;
    protected _debug: Debugger;
    protected debug: (...args: any) => void;
    /**
     * Creates a new verkle tree.
     * @param opts Options for instantiating the verkle tree
     *
     * Note: in most cases, the static {@link createVerkleTree} constructor should be used. It uses the same API but provides sensible defaults
     */
    constructor(opts: VerkleTreeOpts);
    /**
     * Gets and/or Sets the current root of the `tree`
     */
    root(value?: Uint8Array | null): Uint8Array;
    /**
     * Checks if a given root exists.
     */
    checkRoot(root: Uint8Array): Promise<boolean>;
    /**
     * Gets values at a given verkle `stem` and set of suffixes
     * @param stem - the stem of the leaf node where we're seeking values
     * @param suffixes - an array of suffixes corresponding to the values desired
     * @returns A Promise that resolves to an array of `Uint8Array`s if a value
     * was found or `undefined` if no value was found at a given suffixes.
     */
    get(stem: Uint8Array, suffixes: number[]): Promise<(Uint8Array | undefined)[]>;
    /**
     * Stores given `values` at the given `stem` and `suffixes` or do a delete if `value` is empty Uint8Array
     * @param key - the stem to store the value at (must be 31 bytes long)
     * @param suffixes - array of suffixes at which to store individual values
     * @param value - the value(s) to store
     * @returns A Promise that resolves once value(s) are stored.
     */
    put(stem: Uint8Array, suffixes: number[], values?: (Uint8Array | LeafVerkleNodeValue.Untouched)[]): Promise<void>;
    del(stem: Uint8Array, suffixes: number[]): Promise<void>;
    /**
     * Helper method for updating or creating the parent internal node for a given leaf node
     * @param leafNode the child leaf node that will be referenced by the new/updated internal node
     * returned by this method
     * @param nearestNode the nearest node to the new leaf node
     * @param pathToNode the path to `nearestNode`
     * @returns a tuple of the updated parent node and the path to that parent (i.e. the partial stem of the leaf node that leads to the parent)
     */
    updateParent(leafNode: LeafVerkleNode, nearestNode: VerkleNode, pathToNode: Uint8Array): {
        node: InternalVerkleNode;
        lastPath: Uint8Array;
    };
    /**
     * Tries to find a path to the node for the given key.
     * It returns a `stack` of nodes to the closest node.
     * @param key - the search key
     * @param throwIfMissing - if true, throws if any nodes are missing. Used for verifying proofs. (default: false)
     */
    findPath(key: Uint8Array): Promise<Path>;
    /**
     * Create empty root node for initializing an empty tree.
     */
    createRootNode(): Promise<void>;
    /**
     * Saves a stack of nodes to the database.
     *
     * @param putStack - an array of tuples of keys (the partial path of the node in the trie) and nodes (VerkleNodes)
     */
    saveStack(putStack: [Uint8Array, VerkleNode][]): Promise<void>;
    /**
     * Saves the nodes from a proof into the tree.
     * @param proof
     */
    fromProof(_proof: Proof): Promise<void>;
    /**
     * Creates a proof from a tree and key that can be verified using {@link VerkleTree.verifyVerkleProof}.
     * @param key
     */
    createVerkleProof(_key: Uint8Array): Promise<Proof>;
    /**
     * Verifies a proof.
     * @param rootHash
     * @param key
     * @param proof
     * @throws If proof is found to be invalid.
     * @returns The value from the key, or null if valid proof of non-existence.
     */
    verifyVerkleProof(_rootHash: Uint8Array, _key: Uint8Array, _proof: Proof): Promise<Uint8Array | null>;
    /**
     * The `data` event is given an `Object` that has two properties; the `key` and the `value`. Both should be Uint8Arrays.
     * @return Returns a [stream](https://nodejs.org/dist/latest-v12.x/docs/api/stream.html#stream_class_stream_readable) of the contents of the `tree`
     */
    createReadStream(): any;
    /**
     * Returns a copy of the underlying tree.
     *
     * Note on db: the copy will create a reference to the
     * same underlying database.
     *
     * Note on cache: for memory reasons a copy will not
     * recreate a new LRU cache but initialize with cache
     * being deactivated.
     *
     * @param includeCheckpoints - If true and during a checkpoint, the copy will contain the checkpointing metadata and will use the same scratch as underlying db.
     */
    shallowCopy(includeCheckpoints?: boolean): VerkleTree;
    /**
     * Persists the root hash in the underlying database
     */
    persistRoot(): Promise<void>;
    /**
     * Is the tree during a checkpoint phase?
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
     * Reverts the tree to the state it was at when `checkpoint` was first called.
     * If during a nested checkpoint, sets root to most recent checkpoint, and sets
     * parent checkpoint as current.
     */
    revert(): Promise<void>;
    /**
     * Flushes all checkpoints, restoring the initial checkpoint state.
     */
    flushCheckpoints(): void;
}
export {};
=======
import { Lock } from '@synthesizer-libs/util';
import { CheckpointDB } from './db/checkpoint.js';
import { InternalVerkleNode } from './node/internalNode.js';
import { LeafVerkleNode } from './node/leafNode.js';
import { LeafVerkleNodeValue, type VerkleNode } from './node/types.js';
import { type Proof, type VerkleTreeOpts } from './types.js';
import type { VerkleCrypto } from '@synthesizer-libs/util';
import type { Debugger } from 'debug';
interface Path {
    node: VerkleNode | null;
    remaining: Uint8Array;
    stack: Array<[VerkleNode, Uint8Array]>;
}
/**
 * The basic verkle tree interface, use with `import { VerkleTree } from '@synthesizer-libs/verkle'`.
 */
export declare class VerkleTree {
    _opts: VerkleTreeOpts;
    /** The root for an empty tree */
    EMPTY_TREE_ROOT: Uint8Array;
    /** The backend DB */
    protected _db: CheckpointDB;
    protected _hashLen: number;
    protected _lock: Lock;
    protected _root: Uint8Array;
    protected verkleCrypto: VerkleCrypto;
    /** Debug logging */
    protected DEBUG: boolean;
    protected _debug: Debugger;
    protected debug: (...args: any) => void;
    /**
     * Creates a new verkle tree.
     * @param opts Options for instantiating the verkle tree
     *
     * Note: in most cases, the static {@link createVerkleTree} constructor should be used. It uses the same API but provides sensible defaults
     */
    constructor(opts: VerkleTreeOpts);
    /**
     * Gets and/or Sets the current root of the `tree`
     */
    root(value?: Uint8Array | null): Uint8Array;
    /**
     * Checks if a given root exists.
     */
    checkRoot(root: Uint8Array): Promise<boolean>;
    /**
     * Gets values at a given verkle `stem` and set of suffixes
     * @param stem - the stem of the leaf node where we're seeking values
     * @param suffixes - an array of suffixes corresponding to the values desired
     * @returns A Promise that resolves to an array of `Uint8Array`s if a value
     * was found or `undefined` if no value was found at a given suffixes.
     */
    get(stem: Uint8Array, suffixes: number[]): Promise<(Uint8Array | undefined)[]>;
    /**
     * Stores given `values` at the given `stem` and `suffixes` or do a delete if `value` is empty Uint8Array
     * @param key - the stem to store the value at (must be 31 bytes long)
     * @param suffixes - array of suffixes at which to store individual values
     * @param value - the value(s) to store
     * @returns A Promise that resolves once value(s) are stored.
     */
    put(stem: Uint8Array, suffixes: number[], values?: (Uint8Array | LeafVerkleNodeValue.Untouched)[]): Promise<void>;
    del(stem: Uint8Array, suffixes: number[]): Promise<void>;
    /**
     * Helper method for updating or creating the parent internal node for a given leaf node
     * @param leafNode the child leaf node that will be referenced by the new/updated internal node
     * returned by this method
     * @param nearestNode the nearest node to the new leaf node
     * @param pathToNode the path to `nearestNode`
     * @returns a tuple of the updated parent node and the path to that parent (i.e. the partial stem of the leaf node that leads to the parent)
     */
    updateParent(leafNode: LeafVerkleNode, nearestNode: VerkleNode, pathToNode: Uint8Array): {
        node: InternalVerkleNode;
        lastPath: Uint8Array;
    };
    /**
     * Tries to find a path to the node for the given key.
     * It returns a `stack` of nodes to the closest node.
     * @param key - the search key
     * @param throwIfMissing - if true, throws if any nodes are missing. Used for verifying proofs. (default: false)
     */
    findPath(key: Uint8Array): Promise<Path>;
    /**
     * Create empty root node for initializing an empty tree.
     */
    createRootNode(): Promise<void>;
    /**
     * Saves a stack of nodes to the database.
     *
     * @param putStack - an array of tuples of keys (the partial path of the node in the trie) and nodes (VerkleNodes)
     */
    saveStack(putStack: [Uint8Array, VerkleNode][]): Promise<void>;
    /**
     * Saves the nodes from a proof into the tree.
     * @param proof
     */
    fromProof(_proof: Proof): Promise<void>;
    /**
     * Creates a proof from a tree and key that can be verified using {@link VerkleTree.verifyVerkleProof}.
     * @param key
     */
    createVerkleProof(_key: Uint8Array): Promise<Proof>;
    /**
     * Verifies a proof.
     * @param rootHash
     * @param key
     * @param proof
     * @throws If proof is found to be invalid.
     * @returns The value from the key, or null if valid proof of non-existence.
     */
    verifyVerkleProof(_rootHash: Uint8Array, _key: Uint8Array, _proof: Proof): Promise<Uint8Array | null>;
    /**
     * The `data` event is given an `Object` that has two properties; the `key` and the `value`. Both should be Uint8Arrays.
     * @return Returns a [stream](https://nodejs.org/dist/latest-v12.x/docs/api/stream.html#stream_class_stream_readable) of the contents of the `tree`
     */
    createReadStream(): any;
    /**
     * Returns a copy of the underlying tree.
     *
     * Note on db: the copy will create a reference to the
     * same underlying database.
     *
     * Note on cache: for memory reasons a copy will not
     * recreate a new LRU cache but initialize with cache
     * being deactivated.
     *
     * @param includeCheckpoints - If true and during a checkpoint, the copy will contain the checkpointing metadata and will use the same scratch as underlying db.
     */
    shallowCopy(includeCheckpoints?: boolean): VerkleTree;
    /**
     * Persists the root hash in the underlying database
     */
    persistRoot(): Promise<void>;
    /**
     * Is the tree during a checkpoint phase?
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
     * Reverts the tree to the state it was at when `checkpoint` was first called.
     * If during a nested checkpoint, sets root to most recent checkpoint, and sets
     * parent checkpoint as current.
     */
    revert(): Promise<void>;
    /**
     * Flushes all checkpoints, restoring the initial checkpoint state.
     */
    flushCheckpoints(): void;
}
export {};
>>>>>>> 603bf51d9e02a58183fabb7f7fd08e9580ceef44
//# sourceMappingURL=verkleTree.d.ts.map