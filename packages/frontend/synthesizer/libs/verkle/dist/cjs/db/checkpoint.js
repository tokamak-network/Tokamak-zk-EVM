"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckpointDB = void 0;
const util_1 = require("@ethereumjs/util");
const lru_cache_1 = require("lru-cache");
/**
 * DB is a thin wrapper around the underlying levelup db,
 * which validates inputs and sets encoding type.
 */
class CheckpointDB {
    /**
     * Initialize a DB instance.
     */
    constructor(opts) {
        this._stats = {
            cache: {
                reads: 0,
                hits: 0,
                writes: 0,
            },
            db: {
                reads: 0,
                hits: 0,
                writes: 0,
            },
        };
        this.db = opts.db;
        this.cacheSize = opts.cacheSize ?? 0;
        // Roots of tree at the moment of checkpoint
        this.checkpoints = [];
        if (this.cacheSize > 0) {
            this._cache = new lru_cache_1.LRUCache({
                max: this.cacheSize,
                updateAgeOnGet: true,
            });
        }
    }
    /**
     * Flush the checkpoints and use the given checkpoints instead.
     * @param {Checkpoint[]} checkpoints
     */
    setCheckpoints(checkpoints) {
        this.checkpoints = [];
        for (let i = 0; i < checkpoints.length; i++) {
            this.checkpoints.push({
                root: checkpoints[i].root,
                keyValueMap: new Map(checkpoints[i].keyValueMap),
            });
        }
    }
    /**
     * Is the DB during a checkpoint phase?
     */
    hasCheckpoints() {
        return this.checkpoints.length > 0;
    }
    /**
     * Adds a new checkpoint to the stack
     * @param root
     */
    checkpoint(root) {
        this.checkpoints.push({ keyValueMap: new Map(), root });
    }
    /**
     * Commits the latest checkpoint
     */
    async commit() {
        const { keyValueMap } = this.checkpoints.pop();
        if (!this.hasCheckpoints()) {
            // This was the final checkpoint, we should now commit and flush everything to disk
            const batchOp = [];
            for (const [key, value] of keyValueMap.entries()) {
                if (value === undefined) {
                    batchOp.push({
                        type: 'del',
                        key: (0, util_1.hexToBytes)((0, util_1.isHexString)(key) ? key : `0x${key}`),
                        opts: {
                            keyEncoding: util_1.KeyEncoding.Bytes,
                        },
                    });
                }
                else {
                    batchOp.push({
                        type: 'put',
                        key: (0, util_1.hexToBytes)((0, util_1.isHexString)(key) ? key : `0x${key}`),
                        value,
                        opts: { keyEncoding: util_1.KeyEncoding.Bytes, valueEncoding: util_1.ValueEncoding.Bytes },
                    });
                }
            }
            await this.batch(batchOp);
        }
        else {
            // dump everything into the current (higher level) diff cache
            const currentKeyValueMap = this.checkpoints[this.checkpoints.length - 1].keyValueMap;
            for (const [key, value] of keyValueMap.entries()) {
                currentKeyValueMap.set(key, value);
            }
        }
    }
    /**
     * Reverts the latest checkpoint
     */
    async revert() {
        const { root } = this.checkpoints.pop();
        return root;
    }
    /**
     * @inheritDoc
     */
    async get(key) {
        const keyHex = (0, util_1.bytesToHex)(key);
        if (this._cache !== undefined) {
            const value = this._cache.get(keyHex);
            this._stats.cache.reads += 1;
            if (value !== undefined) {
                this._stats.cache.hits += 1;
                return value;
            }
        }
        // Lookup the value in our diff cache. We return the latest checkpointed value (which should be the value on disk)
        for (let index = this.checkpoints.length - 1; index >= 0; index--) {
            if (this.checkpoints[index].keyValueMap.has(keyHex)) {
                return this.checkpoints[index].keyValueMap.get(keyHex);
            }
        }
        // Nothing has been found in diff cache, look up from disk
        const value = await this.db.get(key, {
            keyEncoding: util_1.KeyEncoding.Bytes,
            valueEncoding: util_1.ValueEncoding.Bytes,
        });
        this._stats.db.reads += 1;
        if (value !== undefined) {
            this._stats.db.hits += 1;
        }
        this._cache?.set(keyHex, value);
        if (this.hasCheckpoints()) {
            // Since we are a checkpoint, put this value in diff cache,
            // so future `get` calls will not look the key up again from disk.
            this.checkpoints[this.checkpoints.length - 1].keyValueMap.set(keyHex, value);
        }
        return value;
    }
    /**
     * @inheritDoc
     */
    async put(key, value) {
        const keyHex = (0, util_1.bytesToHex)(key);
        if (this.hasCheckpoints()) {
            // put value in diff cache
            this.checkpoints[this.checkpoints.length - 1].keyValueMap.set(keyHex, value);
        }
        else {
            await this.db.put(key, value, {
                keyEncoding: util_1.KeyEncoding.Bytes,
                valueEncoding: util_1.ValueEncoding.Bytes,
            });
            this._stats.db.writes += 1;
            if (this._cache !== undefined) {
                this._cache.set(keyHex, value);
                this._stats.cache.writes += 1;
            }
        }
    }
    /**
     * @inheritDoc
     */
    async del(key) {
        const keyHex = (0, util_1.bytesToHex)(key);
        if (this.hasCheckpoints()) {
            // delete the value in the current diff cache
            this.checkpoints[this.checkpoints.length - 1].keyValueMap.set(keyHex, undefined);
        }
        else {
            // delete the value on disk
            await this.db.del(key, {
                keyEncoding: util_1.KeyEncoding.Bytes,
            });
            this._stats.db.writes += 1;
            if (this._cache !== undefined) {
                this._cache.set(keyHex, undefined);
                this._stats.cache.writes += 1;
            }
        }
    }
    /**
     * @inheritDoc
     */
    async batch(opStack) {
        if (this.hasCheckpoints()) {
            for (const op of opStack) {
                if (op.type === 'put') {
                    await this.put(op.key, op.value);
                }
                else if (op.type === 'del') {
                    await this.del(op.key);
                }
            }
        }
        else {
            const convertedOps = opStack.map((op) => {
                const convertedOp = {
                    key: op.key,
                    value: op.type === 'put' ? op.value : undefined,
                    type: op.type,
                    opts: op.opts,
                };
                this._stats.db.writes += 1;
                if (op.type === 'put')
                    return convertedOp;
                else
                    return convertedOp;
            });
            await this.db.batch(convertedOps);
        }
    }
    stats(reset = true) {
        const stats = { ...this._stats, size: this._cache?.size ?? 0 };
        if (reset) {
            this._stats = {
                cache: {
                    reads: 0,
                    hits: 0,
                    writes: 0,
                },
                db: {
                    reads: 0,
                    hits: 0,
                    writes: 0,
                },
            };
        }
        return stats;
    }
    /**
     * @inheritDoc
     */
    shallowCopy() {
        return new CheckpointDB({ db: this.db, cacheSize: this.cacheSize });
    }
    open() {
        return Promise.resolve();
    }
}
exports.CheckpointDB = CheckpointDB;
//# sourceMappingURL=checkpoint.js.map