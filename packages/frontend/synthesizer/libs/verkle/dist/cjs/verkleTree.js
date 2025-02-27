<<<<<<< HEAD
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerkleTree = void 0;
const util_1 = require("@ethereumjs/util");
const debug_1 = require("debug");
const checkpoint_js_1 = require("./db/checkpoint.js");
const internalNode_js_1 = require("./node/internalNode.js");
const leafNode_js_1 = require("./node/leafNode.js");
const types_js_1 = require("./node/types.js");
const util_js_1 = require("./node/util.js");
const types_js_2 = require("./types.js");
/**
 * The basic verkle tree interface, use with `import { VerkleTree } from '@ethereumjs/verkle'`.
 */
class VerkleTree {
    /**
     * Creates a new verkle tree.
     * @param opts Options for instantiating the verkle tree
     *
     * Note: in most cases, the static {@link createVerkleTree} constructor should be used. It uses the same API but provides sensible defaults
     */
    constructor(opts) {
        this._lock = new util_1.Lock();
        this._debug = (0, debug_1.default)('verkle:#');
        this._opts = opts;
        if (opts.db instanceof checkpoint_js_1.CheckpointDB) {
            throw new Error('Cannot pass in an instance of CheckpointDB');
        }
        this._db = new checkpoint_js_1.CheckpointDB({ db: opts.db, cacheSize: opts.cacheSize });
        this.EMPTY_TREE_ROOT = new Uint8Array(32);
        this._hashLen = this.EMPTY_TREE_ROOT.length;
        this._root = this.EMPTY_TREE_ROOT;
        if (opts?.root) {
            this.root(opts.root);
        }
        this.verkleCrypto = opts.verkleCrypto;
        this.DEBUG =
            typeof window === 'undefined' ? (process?.env?.DEBUG?.includes('ethjs') ?? false) : false;
        this.debug = this.DEBUG
            ? (message, namespaces = []) => {
                let log = this._debug;
                for (const name of namespaces) {
                    log = log.extend(name);
                }
                log(message);
            }
            : (..._) => { };
        this.DEBUG &&
            this.debug(`Trie created:
    || Root: ${(0, util_1.bytesToHex)(this._root)}
    || Persistent: ${this._opts.useRootPersistence}
    || CacheSize: ${this._opts.cacheSize}
    || ----------------`);
    }
    /**
     * Gets and/or Sets the current root of the `tree`
     */
    root(value) {
        if (value !== undefined) {
            if (value === null) {
                value = this.EMPTY_TREE_ROOT;
            }
            if (value.length !== this._hashLen) {
                throw new Error(`Invalid root length. Roots are ${this._hashLen} bytes`);
            }
            this._root = value;
        }
        return this._root;
    }
    /**
     * Checks if a given root exists.
     */
    async checkRoot(root) {
        try {
            const value = await this._db.get(root);
            return value !== null;
        }
        catch (error) {
            if (error.message === 'Missing node in DB') {
                return (0, util_1.equalsBytes)(root, this.EMPTY_TREE_ROOT);
            }
            else {
                throw error;
            }
        }
    }
    /**
     * Gets values at a given verkle `stem` and set of suffixes
     * @param stem - the stem of the leaf node where we're seeking values
     * @param suffixes - an array of suffixes corresponding to the values desired
     * @returns A Promise that resolves to an array of `Uint8Array`s if a value
     * was found or `undefined` if no value was found at a given suffixes.
     */
    async get(stem, suffixes) {
        if (stem.length !== 31)
            throw new Error(`expected stem with length 31; got ${stem.length}`);
        this.DEBUG && this.debug(`Stem: ${(0, util_1.bytesToHex)(stem)}; Suffix: ${suffixes}`, ['get']);
        const res = await this.findPath(stem);
        if (res.node instanceof leafNode_js_1.LeafVerkleNode) {
            // The retrieved leaf node contains an array of 256 possible values.
            // We read all the suffixes to get the desired values
            const values = [];
            for (const suffix of suffixes) {
                const value = res.node.getValue(suffix);
                this.DEBUG &&
                    this.debug(`Suffix: ${suffix}; Value: ${value === undefined ? 'undefined' : (0, util_1.bytesToHex)(value)}`, ['get']);
                values.push(value);
            }
            return values;
        }
        return [];
    }
    /**
     * Stores given `values` at the given `stem` and `suffixes` or do a delete if `value` is empty Uint8Array
     * @param key - the stem to store the value at (must be 31 bytes long)
     * @param suffixes - array of suffixes at which to store individual values
     * @param value - the value(s) to store
     * @returns A Promise that resolves once value(s) are stored.
     */
    async put(stem, suffixes, values = []) {
        if (stem.length !== 31)
            throw new Error(`expected stem with length 31, got ${stem.length}`);
        if (values.length > 0 && values.length !== suffixes.length) {
            // Must have an equal number of values and suffixes
            throw new Error(`expected number of values; ${values.length} to equal ${suffixes.length}`);
        }
        this.DEBUG && this.debug(`Stem: ${(0, util_1.bytesToHex)(stem)}`, ['put']);
        const putStack = [];
        // Find path to nearest node
        const foundPath = await this.findPath(stem);
        // Sanity check - we should at least get the root node back
        if (foundPath.stack.length === 0) {
            throw new Error(`Root node not found in trie`);
        }
        // Step 1) Create or update the leaf node
        let leafNode;
        // First see if leaf node already exists
        if (foundPath.node !== null) {
            // Sanity check to verify we have the right node type
            if (!(0, util_js_1.isLeafVerkleNode)(foundPath.node)) {
                throw new Error(`expected leaf node found at ${(0, util_1.bytesToHex)(stem)}. Got internal node instead`);
            }
            leafNode = foundPath.node;
            // Sanity check to verify we have the right leaf node
            if (!(0, util_1.equalsBytes)(leafNode.stem, stem)) {
                throw new Error(`invalid leaf node found. Expected stem: ${(0, util_1.bytesToHex)(stem)}; got ${(0, util_1.bytesToHex)(foundPath.node.stem)}`);
            }
        }
        else {
            // Leaf node doesn't exist, create a new one
            leafNode = await leafNode_js_1.LeafVerkleNode.create(stem, this.verkleCrypto);
            this.DEBUG && this.debug(`Creating new leaf node at stem: ${(0, util_1.bytesToHex)(stem)}`, ['put']);
        }
        for (let i = 0; i < values.length; i++) {
            const value = values[i];
            const suffix = suffixes[i];
            // Update value(s) in leaf node
            if (value !== types_js_1.LeafVerkleNodeValue.Untouched && (0, util_1.equalsBytes)(value, (0, util_js_1.createZeroesLeafValue)())) {
                // Special case for when the deleted leaf value or zeroes is passed to `put`
                // Writing the deleted leaf value to the suffix
                leafNode.setValue(suffix, types_js_1.LeafVerkleNodeValue.Deleted);
            }
            else {
                leafNode.setValue(suffix, value);
            }
            this.DEBUG &&
                this.debug(`Updating value for suffix: ${suffix} to value: ${value instanceof Uint8Array ? (0, util_1.bytesToHex)(value) : value} at leaf node with stem: ${(0, util_1.bytesToHex)(stem)}`, ['put']);
        }
        // Push new/updated leafNode to putStack
        putStack.push([leafNode.hash(), leafNode]);
        // `path` is the path to the last node pushed to the `putStack`
        let lastPath = leafNode.stem;
        // Step 2) Determine if a new internal node is needed
        if (foundPath.stack.length > 1) {
            // Only insert new internal node if we have more than 1 node in the path
            // since a single node indicates only the root node is in the path
            const nearestNodeTuple = foundPath.stack.pop();
            const nearestNode = nearestNodeTuple[0];
            lastPath = nearestNodeTuple[1];
            const updatedParentTuple = this.updateParent(leafNode, nearestNode, lastPath);
            putStack.push([updatedParentTuple.node.hash(), updatedParentTuple.node]);
            lastPath = updatedParentTuple.lastPath;
            // Step 3) Walk up trie and update child references in parent internal nodes
            while (foundPath.stack.length > 1) {
                const [nextNode, nextPath] = foundPath.stack.pop();
                // Compute the child index to be updated on `nextNode`
                const childIndex = lastPath[(0, util_1.matchingBytesLength)(lastPath, nextPath)];
                // Update child reference
                nextNode.setChild(childIndex, {
                    commitment: putStack[putStack.length - 1][1].commitment,
                    path: lastPath,
                });
                this.DEBUG &&
                    this.debug(`Updating child reference for node with path: ${(0, util_1.bytesToHex)(lastPath)} at index ${childIndex} in internal node at path ${(0, util_1.bytesToHex)(nextPath)}`, ['put']);
                // Hold onto `path` to current node for updating next parent node child index
                lastPath = nextPath;
                putStack.push([nextNode.hash(), nextNode]);
            }
        }
        // Step 4) Update root node
        const rootNode = foundPath.stack.pop()[0];
        rootNode.setChild(stem[0], {
            commitment: putStack[putStack.length - 1][1].commitment,
            path: lastPath,
        });
        this.root(this.verkleCrypto.serializeCommitment(rootNode.commitment));
        this.DEBUG &&
            this.debug(`Updating child reference for node with path: ${(0, util_1.bytesToHex)(lastPath)} at index ${lastPath[0]} in root node`, ['put']);
        this.DEBUG && this.debug(`Updating root node hash to ${(0, util_1.bytesToHex)(this._root)}`, ['put']);
        putStack.push([this._root, rootNode]);
        await this.saveStack(putStack);
    }
    async del(stem, suffixes) {
        this.DEBUG && this.debug(`Stem: ${(0, util_1.bytesToHex)(stem)}; Suffix(es): ${suffixes}`, ['del']);
        await this.put(stem, suffixes, new Array(suffixes.length).fill((0, util_js_1.createZeroesLeafValue)()));
    }
    /**
     * Helper method for updating or creating the parent internal node for a given leaf node
     * @param leafNode the child leaf node that will be referenced by the new/updated internal node
     * returned by this method
     * @param nearestNode the nearest node to the new leaf node
     * @param pathToNode the path to `nearestNode`
     * @returns a tuple of the updated parent node and the path to that parent (i.e. the partial stem of the leaf node that leads to the parent)
     */
    updateParent(leafNode, nearestNode, pathToNode) {
        // Compute the portion of leafNode.stem and nearestNode.path that match (i.e. the partial path closest to leafNode.stem)
        const partialMatchingStemIndex = (0, util_1.matchingBytesLength)(leafNode.stem, pathToNode);
        let internalNode;
        if ((0, util_js_1.isLeafVerkleNode)(nearestNode)) {
            // We need to create a new internal node and set nearestNode and leafNode as child nodes of it
            // Create new internal node
            internalNode = internalNode_js_1.InternalVerkleNode.create(this.verkleCrypto);
            // Set leafNode and nextNode as children of the new internal node
            internalNode.setChild(leafNode.stem[partialMatchingStemIndex], {
                commitment: leafNode.commitment,
                path: leafNode.stem,
            });
            internalNode.setChild(nearestNode.stem[partialMatchingStemIndex], {
                commitment: nearestNode.commitment,
                path: nearestNode.stem,
            });
            // Find the path to the new internal node (the matching portion of the leaf node and next node's stems)
            pathToNode = leafNode.stem.slice(0, partialMatchingStemIndex);
            this.DEBUG &&
                this.debug(`Creating new internal node at path ${(0, util_1.bytesToHex)(pathToNode)}`, ['put']);
        }
        else {
            // Nearest node is an internal node.  We need to update the appropriate child reference
            // to the new leaf node
            internalNode = nearestNode;
            internalNode.setChild(leafNode.stem[partialMatchingStemIndex], {
                commitment: leafNode.commitment,
                path: leafNode.stem,
            });
            this.DEBUG &&
                this.debug(`Updating child reference for leaf node with stem: ${(0, util_1.bytesToHex)(leafNode.stem)} at index ${leafNode.stem[partialMatchingStemIndex]} in internal node at path ${(0, util_1.bytesToHex)(leafNode.stem.slice(0, partialMatchingStemIndex))}`, ['put']);
        }
        return { node: internalNode, lastPath: pathToNode };
    }
    /**
     * Tries to find a path to the node for the given key.
     * It returns a `stack` of nodes to the closest node.
     * @param key - the search key
     * @param throwIfMissing - if true, throws if any nodes are missing. Used for verifying proofs. (default: false)
     */
    async findPath(key) {
        this.DEBUG && this.debug(`Path (${key.length}): [${(0, util_1.bytesToHex)(key)}]`, ['find_path']);
        const result = {
            node: null,
            stack: [],
            remaining: key,
        };
        // TODO: Decide if findPath should return an empty stack if we have an empty trie or a path with just the empty root node
        // if (equalsBytes(this.root(), this.EMPTY_TREE_ROOT)) return result
        // Get root node
        let rawNode = await this._db.get(this.root());
        if (rawNode === undefined)
            throw new Error('root node should exist');
        const rootNode = (0, util_js_1.decodeVerkleNode)(rawNode, this.verkleCrypto);
        this.DEBUG && this.debug(`Starting with Root Node: [${(0, util_1.bytesToHex)(this.root())}]`, ['find_path']);
        result.stack.push([rootNode, this.root()]);
        let child = rootNode.children[key[0]];
        // Root node doesn't contain a child node's commitment on the first byte of the path so we're done
        if (child === null) {
            this.DEBUG && this.debug(`Partial Path ${(0, util_1.intToHex)(key[0])} - found no child.`, ['find_path']);
            return result;
        }
        let finished = false;
        while (!finished) {
            // Look up child node by node hash
            rawNode = await this._db.get(this.verkleCrypto.hashCommitment(child.commitment));
            // We should always find the node if the path is specified in child.path
            if (rawNode === undefined)
                throw new Error(`missing node at ${(0, util_1.bytesToHex)(child.path)}`);
            const decodedNode = (0, util_js_1.decodeVerkleNode)(rawNode, this.verkleCrypto);
            // Calculate the index of the last matching byte in the key
            const matchingKeyLength = (0, util_1.matchingBytesLength)(key, child.path);
            const foundNode = (0, util_1.equalsBytes)(key, child.path);
            if (foundNode || child.path.length >= key.length || (0, util_js_1.isLeafVerkleNode)(decodedNode)) {
                // If the key and child.path are equal, then we found the node
                // If the child.path is the same length or longer than the key but doesn't match it
                // or the found node is a leaf node, we've found another node where this node should
                // be if it existed in the trie
                // i.e. the node doesn't exist in the trie
                finished = true;
                if (foundNode) {
                    this.DEBUG &&
                        this.debug(`Path ${(0, util_1.bytesToHex)(key)} - found full path to node ${(0, util_1.bytesToHex)(decodedNode.hash())}.`, ['find_path']);
                    result.node = decodedNode;
                    result.remaining = new Uint8Array();
                    return result;
                }
                // We found a different node than the one specified by `key`
                // so the sought node doesn't exist
                result.remaining = key.slice(matchingKeyLength);
                const pathToNearestNode = (0, util_js_1.isLeafVerkleNode)(decodedNode) ? decodedNode.stem : child.path;
                this.DEBUG &&
                    this.debug(`Path ${(0, util_1.bytesToHex)(pathToNearestNode)} - found path to nearest node ${(0, util_1.bytesToHex)(decodedNode.hash())} but target node not found.`, ['find_path']);
                result.stack.push([decodedNode, pathToNearestNode]);
                return result;
            }
            // Push internal node to path stack
            result.stack.push([decodedNode, key.slice(0, matchingKeyLength)]);
            this.DEBUG &&
                this.debug(`Partial Path ${(0, util_1.bytesToHex)(key.slice(0, matchingKeyLength))} - found next node in path ${(0, util_1.bytesToHex)(decodedNode.hash())}.`, ['find_path']);
            // Get the next child node in the path
            const childIndex = key[matchingKeyLength];
            child = decodedNode.children[childIndex];
        }
        this.DEBUG &&
            this.debug(`Found partial path ${key.slice(31 - result.remaining.length)} but sought node is not present in trie.`, ['find_path']);
        return result;
    }
    /**
     * Create empty root node for initializing an empty tree.
     */
    async createRootNode() {
        const rootNode = new internalNode_js_1.InternalVerkleNode({
            commitment: this.verkleCrypto.zeroCommitment,
            verkleCrypto: this.verkleCrypto,
        });
        this.DEBUG && this.debug(`No root node. Creating new root node`, ['initialize']);
        // Set trie root to serialized (aka compressed) commitment for later use in verkle proof
        this.root(this.verkleCrypto.serializeCommitment(rootNode.commitment));
        await this.saveStack([[this.root(), rootNode]]);
        return;
    }
    /**
     * Saves a stack of nodes to the database.
     *
     * @param putStack - an array of tuples of keys (the partial path of the node in the trie) and nodes (VerkleNodes)
     */
    async saveStack(putStack) {
        const opStack = putStack.map(([key, node]) => {
            return {
                type: 'put',
                key,
                value: node.serialize(),
            };
        });
        await this._db.batch(opStack);
    }
    /**
     * Saves the nodes from a proof into the tree.
     * @param proof
     */
    async fromProof(_proof) {
        throw new Error('Not implemented');
    }
    /**
     * Creates a proof from a tree and key that can be verified using {@link VerkleTree.verifyVerkleProof}.
     * @param key
     */
    async createVerkleProof(_key) {
        throw new Error('Not implemented');
    }
    /**
     * Verifies a proof.
     * @param rootHash
     * @param key
     * @param proof
     * @throws If proof is found to be invalid.
     * @returns The value from the key, or null if valid proof of non-existence.
     */
    async verifyVerkleProof(_rootHash, _key, _proof) {
        throw new Error('Not implemented');
    }
    /**
     * The `data` event is given an `Object` that has two properties; the `key` and the `value`. Both should be Uint8Arrays.
     * @return Returns a [stream](https://nodejs.org/dist/latest-v12.x/docs/api/stream.html#stream_class_stream_readable) of the contents of the `tree`
     */
    createReadStream() {
        throw new Error('Not implemented');
    }
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
    shallowCopy(includeCheckpoints = true) {
        const tree = new VerkleTree({
            ...this._opts,
            db: this._db.db.shallowCopy(),
            root: this.root(),
            cacheSize: 0,
            verkleCrypto: this.verkleCrypto,
        });
        if (includeCheckpoints && this.hasCheckpoints()) {
            tree._db.setCheckpoints(this._db.checkpoints);
        }
        return tree;
    }
    /**
     * Persists the root hash in the underlying database
     */
    async persistRoot() {
        if (this._opts.useRootPersistence === true) {
            await this._db.put(types_js_2.ROOT_DB_KEY, this.root());
        }
    }
    /**
     * Is the tree during a checkpoint phase?
     */
    hasCheckpoints() {
        return this._db.hasCheckpoints();
    }
    /**
     * Creates a checkpoint that can later be reverted to or committed.
     * After this is called, all changes can be reverted until `commit` is called.
     */
    checkpoint() {
        this._db.checkpoint(this.root());
    }
    /**
     * Commits a checkpoint to disk, if current checkpoint is not nested.
     * If nested, only sets the parent checkpoint as current checkpoint.
     * @throws If not during a checkpoint phase
     */
    async commit() {
        if (!this.hasCheckpoints()) {
            throw new Error('trying to commit when not checkpointed');
        }
        await this._lock.acquire();
        await this._db.commit();
        await this.persistRoot();
        this._lock.release();
    }
    /**
     * Reverts the tree to the state it was at when `checkpoint` was first called.
     * If during a nested checkpoint, sets root to most recent checkpoint, and sets
     * parent checkpoint as current.
     */
    async revert() {
        if (!this.hasCheckpoints()) {
            throw new Error('trying to revert when not checkpointed');
        }
        await this._lock.acquire();
        this.root(await this._db.revert());
        await this.persistRoot();
        this._lock.release();
    }
    /**
     * Flushes all checkpoints, restoring the initial checkpoint state.
     */
    flushCheckpoints() {
        this._db.checkpoints = [];
    }
}
exports.VerkleTree = VerkleTree;
=======
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerkleTree = void 0;
const util_1 = require("@synthesizer-libs/util");
const debug_1 = require("debug");
const checkpoint_js_1 = require("./db/checkpoint.js");
const internalNode_js_1 = require("./node/internalNode.js");
const leafNode_js_1 = require("./node/leafNode.js");
const types_js_1 = require("./node/types.js");
const util_js_1 = require("./node/util.js");
const types_js_2 = require("./types.js");
/**
 * The basic verkle tree interface, use with `import { VerkleTree } from '@synthesizer-libs/verkle'`.
 */
class VerkleTree {
    /**
     * Creates a new verkle tree.
     * @param opts Options for instantiating the verkle tree
     *
     * Note: in most cases, the static {@link createVerkleTree} constructor should be used. It uses the same API but provides sensible defaults
     */
    constructor(opts) {
        this._lock = new util_1.Lock();
        this._debug = (0, debug_1.default)('verkle:#');
        this._opts = opts;
        if (opts.db instanceof checkpoint_js_1.CheckpointDB) {
            throw new Error('Cannot pass in an instance of CheckpointDB');
        }
        this._db = new checkpoint_js_1.CheckpointDB({ db: opts.db, cacheSize: opts.cacheSize });
        this.EMPTY_TREE_ROOT = new Uint8Array(32);
        this._hashLen = this.EMPTY_TREE_ROOT.length;
        this._root = this.EMPTY_TREE_ROOT;
        if (opts?.root) {
            this.root(opts.root);
        }
        this.verkleCrypto = opts.verkleCrypto;
        this.DEBUG =
            typeof window === 'undefined' ? (process?.env?.DEBUG?.includes('ethjs') ?? false) : false;
        this.debug = this.DEBUG
            ? (message, namespaces = []) => {
                let log = this._debug;
                for (const name of namespaces) {
                    log = log.extend(name);
                }
                log(message);
            }
            : (..._) => { };
        this.DEBUG &&
            this.debug(`Trie created:
    || Root: ${(0, util_1.bytesToHex)(this._root)}
    || Persistent: ${this._opts.useRootPersistence}
    || CacheSize: ${this._opts.cacheSize}
    || ----------------`);
    }
    /**
     * Gets and/or Sets the current root of the `tree`
     */
    root(value) {
        if (value !== undefined) {
            if (value === null) {
                value = this.EMPTY_TREE_ROOT;
            }
            if (value.length !== this._hashLen) {
                throw new Error(`Invalid root length. Roots are ${this._hashLen} bytes`);
            }
            this._root = value;
        }
        return this._root;
    }
    /**
     * Checks if a given root exists.
     */
    async checkRoot(root) {
        try {
            const value = await this._db.get(root);
            return value !== null;
        }
        catch (error) {
            if (error.message === 'Missing node in DB') {
                return (0, util_1.equalsBytes)(root, this.EMPTY_TREE_ROOT);
            }
            else {
                throw error;
            }
        }
    }
    /**
     * Gets values at a given verkle `stem` and set of suffixes
     * @param stem - the stem of the leaf node where we're seeking values
     * @param suffixes - an array of suffixes corresponding to the values desired
     * @returns A Promise that resolves to an array of `Uint8Array`s if a value
     * was found or `undefined` if no value was found at a given suffixes.
     */
    async get(stem, suffixes) {
        if (stem.length !== 31)
            throw new Error(`expected stem with length 31; got ${stem.length}`);
        this.DEBUG && this.debug(`Stem: ${(0, util_1.bytesToHex)(stem)}; Suffix: ${suffixes}`, ['get']);
        const res = await this.findPath(stem);
        if (res.node instanceof leafNode_js_1.LeafVerkleNode) {
            // The retrieved leaf node contains an array of 256 possible values.
            // We read all the suffixes to get the desired values
            const values = [];
            for (const suffix of suffixes) {
                const value = res.node.getValue(suffix);
                this.DEBUG &&
                    this.debug(`Suffix: ${suffix}; Value: ${value === undefined ? 'undefined' : (0, util_1.bytesToHex)(value)}`, ['get']);
                values.push(value);
            }
            return values;
        }
        return [];
    }
    /**
     * Stores given `values` at the given `stem` and `suffixes` or do a delete if `value` is empty Uint8Array
     * @param key - the stem to store the value at (must be 31 bytes long)
     * @param suffixes - array of suffixes at which to store individual values
     * @param value - the value(s) to store
     * @returns A Promise that resolves once value(s) are stored.
     */
    async put(stem, suffixes, values = []) {
        if (stem.length !== 31)
            throw new Error(`expected stem with length 31, got ${stem.length}`);
        if (values.length > 0 && values.length !== suffixes.length) {
            // Must have an equal number of values and suffixes
            throw new Error(`expected number of values; ${values.length} to equal ${suffixes.length}`);
        }
        this.DEBUG && this.debug(`Stem: ${(0, util_1.bytesToHex)(stem)}`, ['put']);
        const putStack = [];
        // Find path to nearest node
        const foundPath = await this.findPath(stem);
        // Sanity check - we should at least get the root node back
        if (foundPath.stack.length === 0) {
            throw new Error(`Root node not found in trie`);
        }
        // Step 1) Create or update the leaf node
        let leafNode;
        // First see if leaf node already exists
        if (foundPath.node !== null) {
            // Sanity check to verify we have the right node type
            if (!(0, util_js_1.isLeafVerkleNode)(foundPath.node)) {
                throw new Error(`expected leaf node found at ${(0, util_1.bytesToHex)(stem)}. Got internal node instead`);
            }
            leafNode = foundPath.node;
            // Sanity check to verify we have the right leaf node
            if (!(0, util_1.equalsBytes)(leafNode.stem, stem)) {
                throw new Error(`invalid leaf node found. Expected stem: ${(0, util_1.bytesToHex)(stem)}; got ${(0, util_1.bytesToHex)(foundPath.node.stem)}`);
            }
        }
        else {
            // Leaf node doesn't exist, create a new one
            leafNode = await leafNode_js_1.LeafVerkleNode.create(stem, this.verkleCrypto);
            this.DEBUG && this.debug(`Creating new leaf node at stem: ${(0, util_1.bytesToHex)(stem)}`, ['put']);
        }
        for (let i = 0; i < values.length; i++) {
            const value = values[i];
            const suffix = suffixes[i];
            // Update value(s) in leaf node
            if (value !== types_js_1.LeafVerkleNodeValue.Untouched && (0, util_1.equalsBytes)(value, (0, util_js_1.createZeroesLeafValue)())) {
                // Special case for when the deleted leaf value or zeroes is passed to `put`
                // Writing the deleted leaf value to the suffix
                leafNode.setValue(suffix, types_js_1.LeafVerkleNodeValue.Deleted);
            }
            else {
                leafNode.setValue(suffix, value);
            }
            this.DEBUG &&
                this.debug(`Updating value for suffix: ${suffix} to value: ${value instanceof Uint8Array ? (0, util_1.bytesToHex)(value) : value} at leaf node with stem: ${(0, util_1.bytesToHex)(stem)}`, ['put']);
        }
        // Push new/updated leafNode to putStack
        putStack.push([leafNode.hash(), leafNode]);
        // `path` is the path to the last node pushed to the `putStack`
        let lastPath = leafNode.stem;
        // Step 2) Determine if a new internal node is needed
        if (foundPath.stack.length > 1) {
            // Only insert new internal node if we have more than 1 node in the path
            // since a single node indicates only the root node is in the path
            const nearestNodeTuple = foundPath.stack.pop();
            const nearestNode = nearestNodeTuple[0];
            lastPath = nearestNodeTuple[1];
            const updatedParentTuple = this.updateParent(leafNode, nearestNode, lastPath);
            putStack.push([updatedParentTuple.node.hash(), updatedParentTuple.node]);
            lastPath = updatedParentTuple.lastPath;
            // Step 3) Walk up trie and update child references in parent internal nodes
            while (foundPath.stack.length > 1) {
                const [nextNode, nextPath] = foundPath.stack.pop();
                // Compute the child index to be updated on `nextNode`
                const childIndex = lastPath[(0, util_1.matchingBytesLength)(lastPath, nextPath)];
                // Update child reference
                nextNode.setChild(childIndex, {
                    commitment: putStack[putStack.length - 1][1].commitment,
                    path: lastPath,
                });
                this.DEBUG &&
                    this.debug(`Updating child reference for node with path: ${(0, util_1.bytesToHex)(lastPath)} at index ${childIndex} in internal node at path ${(0, util_1.bytesToHex)(nextPath)}`, ['put']);
                // Hold onto `path` to current node for updating next parent node child index
                lastPath = nextPath;
                putStack.push([nextNode.hash(), nextNode]);
            }
        }
        // Step 4) Update root node
        const rootNode = foundPath.stack.pop()[0];
        rootNode.setChild(stem[0], {
            commitment: putStack[putStack.length - 1][1].commitment,
            path: lastPath,
        });
        this.root(this.verkleCrypto.serializeCommitment(rootNode.commitment));
        this.DEBUG &&
            this.debug(`Updating child reference for node with path: ${(0, util_1.bytesToHex)(lastPath)} at index ${lastPath[0]} in root node`, ['put']);
        this.DEBUG && this.debug(`Updating root node hash to ${(0, util_1.bytesToHex)(this._root)}`, ['put']);
        putStack.push([this._root, rootNode]);
        await this.saveStack(putStack);
    }
    async del(stem, suffixes) {
        this.DEBUG && this.debug(`Stem: ${(0, util_1.bytesToHex)(stem)}; Suffix(es): ${suffixes}`, ['del']);
        await this.put(stem, suffixes, new Array(suffixes.length).fill((0, util_js_1.createZeroesLeafValue)()));
    }
    /**
     * Helper method for updating or creating the parent internal node for a given leaf node
     * @param leafNode the child leaf node that will be referenced by the new/updated internal node
     * returned by this method
     * @param nearestNode the nearest node to the new leaf node
     * @param pathToNode the path to `nearestNode`
     * @returns a tuple of the updated parent node and the path to that parent (i.e. the partial stem of the leaf node that leads to the parent)
     */
    updateParent(leafNode, nearestNode, pathToNode) {
        // Compute the portion of leafNode.stem and nearestNode.path that match (i.e. the partial path closest to leafNode.stem)
        const partialMatchingStemIndex = (0, util_1.matchingBytesLength)(leafNode.stem, pathToNode);
        let internalNode;
        if ((0, util_js_1.isLeafVerkleNode)(nearestNode)) {
            // We need to create a new internal node and set nearestNode and leafNode as child nodes of it
            // Create new internal node
            internalNode = internalNode_js_1.InternalVerkleNode.create(this.verkleCrypto);
            // Set leafNode and nextNode as children of the new internal node
            internalNode.setChild(leafNode.stem[partialMatchingStemIndex], {
                commitment: leafNode.commitment,
                path: leafNode.stem,
            });
            internalNode.setChild(nearestNode.stem[partialMatchingStemIndex], {
                commitment: nearestNode.commitment,
                path: nearestNode.stem,
            });
            // Find the path to the new internal node (the matching portion of the leaf node and next node's stems)
            pathToNode = leafNode.stem.slice(0, partialMatchingStemIndex);
            this.DEBUG &&
                this.debug(`Creating new internal node at path ${(0, util_1.bytesToHex)(pathToNode)}`, ['put']);
        }
        else {
            // Nearest node is an internal node.  We need to update the appropriate child reference
            // to the new leaf node
            internalNode = nearestNode;
            internalNode.setChild(leafNode.stem[partialMatchingStemIndex], {
                commitment: leafNode.commitment,
                path: leafNode.stem,
            });
            this.DEBUG &&
                this.debug(`Updating child reference for leaf node with stem: ${(0, util_1.bytesToHex)(leafNode.stem)} at index ${leafNode.stem[partialMatchingStemIndex]} in internal node at path ${(0, util_1.bytesToHex)(leafNode.stem.slice(0, partialMatchingStemIndex))}`, ['put']);
        }
        return { node: internalNode, lastPath: pathToNode };
    }
    /**
     * Tries to find a path to the node for the given key.
     * It returns a `stack` of nodes to the closest node.
     * @param key - the search key
     * @param throwIfMissing - if true, throws if any nodes are missing. Used for verifying proofs. (default: false)
     */
    async findPath(key) {
        this.DEBUG && this.debug(`Path (${key.length}): [${(0, util_1.bytesToHex)(key)}]`, ['find_path']);
        const result = {
            node: null,
            stack: [],
            remaining: key,
        };
        // TODO: Decide if findPath should return an empty stack if we have an empty trie or a path with just the empty root node
        // if (equalsBytes(this.root(), this.EMPTY_TREE_ROOT)) return result
        // Get root node
        let rawNode = await this._db.get(this.root());
        if (rawNode === undefined)
            throw new Error('root node should exist');
        const rootNode = (0, util_js_1.decodeVerkleNode)(rawNode, this.verkleCrypto);
        this.DEBUG && this.debug(`Starting with Root Node: [${(0, util_1.bytesToHex)(this.root())}]`, ['find_path']);
        result.stack.push([rootNode, this.root()]);
        let child = rootNode.children[key[0]];
        // Root node doesn't contain a child node's commitment on the first byte of the path so we're done
        if (child === null) {
            this.DEBUG && this.debug(`Partial Path ${(0, util_1.intToHex)(key[0])} - found no child.`, ['find_path']);
            return result;
        }
        let finished = false;
        while (!finished) {
            // Look up child node by node hash
            rawNode = await this._db.get(this.verkleCrypto.hashCommitment(child.commitment));
            // We should always find the node if the path is specified in child.path
            if (rawNode === undefined)
                throw new Error(`missing node at ${(0, util_1.bytesToHex)(child.path)}`);
            const decodedNode = (0, util_js_1.decodeVerkleNode)(rawNode, this.verkleCrypto);
            // Calculate the index of the last matching byte in the key
            const matchingKeyLength = (0, util_1.matchingBytesLength)(key, child.path);
            const foundNode = (0, util_1.equalsBytes)(key, child.path);
            if (foundNode || child.path.length >= key.length || (0, util_js_1.isLeafVerkleNode)(decodedNode)) {
                // If the key and child.path are equal, then we found the node
                // If the child.path is the same length or longer than the key but doesn't match it
                // or the found node is a leaf node, we've found another node where this node should
                // be if it existed in the trie
                // i.e. the node doesn't exist in the trie
                finished = true;
                if (foundNode) {
                    this.DEBUG &&
                        this.debug(`Path ${(0, util_1.bytesToHex)(key)} - found full path to node ${(0, util_1.bytesToHex)(decodedNode.hash())}.`, ['find_path']);
                    result.node = decodedNode;
                    result.remaining = new Uint8Array();
                    return result;
                }
                // We found a different node than the one specified by `key`
                // so the sought node doesn't exist
                result.remaining = key.slice(matchingKeyLength);
                const pathToNearestNode = (0, util_js_1.isLeafVerkleNode)(decodedNode) ? decodedNode.stem : child.path;
                this.DEBUG &&
                    this.debug(`Path ${(0, util_1.bytesToHex)(pathToNearestNode)} - found path to nearest node ${(0, util_1.bytesToHex)(decodedNode.hash())} but target node not found.`, ['find_path']);
                result.stack.push([decodedNode, pathToNearestNode]);
                return result;
            }
            // Push internal node to path stack
            result.stack.push([decodedNode, key.slice(0, matchingKeyLength)]);
            this.DEBUG &&
                this.debug(`Partial Path ${(0, util_1.bytesToHex)(key.slice(0, matchingKeyLength))} - found next node in path ${(0, util_1.bytesToHex)(decodedNode.hash())}.`, ['find_path']);
            // Get the next child node in the path
            const childIndex = key[matchingKeyLength];
            child = decodedNode.children[childIndex];
        }
        this.DEBUG &&
            this.debug(`Found partial path ${key.slice(31 - result.remaining.length)} but sought node is not present in trie.`, ['find_path']);
        return result;
    }
    /**
     * Create empty root node for initializing an empty tree.
     */
    async createRootNode() {
        const rootNode = new internalNode_js_1.InternalVerkleNode({
            commitment: this.verkleCrypto.zeroCommitment,
            verkleCrypto: this.verkleCrypto,
        });
        this.DEBUG && this.debug(`No root node. Creating new root node`, ['initialize']);
        // Set trie root to serialized (aka compressed) commitment for later use in verkle proof
        this.root(this.verkleCrypto.serializeCommitment(rootNode.commitment));
        await this.saveStack([[this.root(), rootNode]]);
        return;
    }
    /**
     * Saves a stack of nodes to the database.
     *
     * @param putStack - an array of tuples of keys (the partial path of the node in the trie) and nodes (VerkleNodes)
     */
    async saveStack(putStack) {
        const opStack = putStack.map(([key, node]) => {
            return {
                type: 'put',
                key,
                value: node.serialize(),
            };
        });
        await this._db.batch(opStack);
    }
    /**
     * Saves the nodes from a proof into the tree.
     * @param proof
     */
    async fromProof(_proof) {
        throw new Error('Not implemented');
    }
    /**
     * Creates a proof from a tree and key that can be verified using {@link VerkleTree.verifyVerkleProof}.
     * @param key
     */
    async createVerkleProof(_key) {
        throw new Error('Not implemented');
    }
    /**
     * Verifies a proof.
     * @param rootHash
     * @param key
     * @param proof
     * @throws If proof is found to be invalid.
     * @returns The value from the key, or null if valid proof of non-existence.
     */
    async verifyVerkleProof(_rootHash, _key, _proof) {
        throw new Error('Not implemented');
    }
    /**
     * The `data` event is given an `Object` that has two properties; the `key` and the `value`. Both should be Uint8Arrays.
     * @return Returns a [stream](https://nodejs.org/dist/latest-v12.x/docs/api/stream.html#stream_class_stream_readable) of the contents of the `tree`
     */
    createReadStream() {
        throw new Error('Not implemented');
    }
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
    shallowCopy(includeCheckpoints = true) {
        const tree = new VerkleTree({
            ...this._opts,
            db: this._db.db.shallowCopy(),
            root: this.root(),
            cacheSize: 0,
            verkleCrypto: this.verkleCrypto,
        });
        if (includeCheckpoints && this.hasCheckpoints()) {
            tree._db.setCheckpoints(this._db.checkpoints);
        }
        return tree;
    }
    /**
     * Persists the root hash in the underlying database
     */
    async persistRoot() {
        if (this._opts.useRootPersistence === true) {
            await this._db.put(types_js_2.ROOT_DB_KEY, this.root());
        }
    }
    /**
     * Is the tree during a checkpoint phase?
     */
    hasCheckpoints() {
        return this._db.hasCheckpoints();
    }
    /**
     * Creates a checkpoint that can later be reverted to or committed.
     * After this is called, all changes can be reverted until `commit` is called.
     */
    checkpoint() {
        this._db.checkpoint(this.root());
    }
    /**
     * Commits a checkpoint to disk, if current checkpoint is not nested.
     * If nested, only sets the parent checkpoint as current checkpoint.
     * @throws If not during a checkpoint phase
     */
    async commit() {
        if (!this.hasCheckpoints()) {
            throw new Error('trying to commit when not checkpointed');
        }
        await this._lock.acquire();
        await this._db.commit();
        await this.persistRoot();
        this._lock.release();
    }
    /**
     * Reverts the tree to the state it was at when `checkpoint` was first called.
     * If during a nested checkpoint, sets root to most recent checkpoint, and sets
     * parent checkpoint as current.
     */
    async revert() {
        if (!this.hasCheckpoints()) {
            throw new Error('trying to revert when not checkpointed');
        }
        await this._lock.acquire();
        this.root(await this._db.revert());
        await this.persistRoot();
        this._lock.release();
    }
    /**
     * Flushes all checkpoints, restoring the initial checkpoint state.
     */
    flushCheckpoints() {
        this._db.checkpoints = [];
    }
}
exports.VerkleTree = VerkleTree;
>>>>>>> 603bf51d9e02a58183fabb7f7fd08e9580ceef44
//# sourceMappingURL=verkleTree.js.map