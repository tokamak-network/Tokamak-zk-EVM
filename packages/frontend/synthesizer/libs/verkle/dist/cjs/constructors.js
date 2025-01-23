"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createVerkleTree = void 0;
const util_1 = require("@ethereumjs/util");
const verkle_cryptography_wasm_1 = require("verkle-cryptography-wasm");
const types_js_1 = require("./types.js");
const verkleTree_js_1 = require("./verkleTree.js");
async function createVerkleTree(opts) {
    const key = types_js_1.ROOT_DB_KEY;
    // Provide sensible default options
    const parsedOptions = {
        ...opts,
        db: opts?.db ?? new util_1.MapDB(),
        verkleCrypto: opts?.verkleCrypto ?? (await (0, verkle_cryptography_wasm_1.loadVerkleCrypto)()),
        useRootPersistence: opts?.useRootPersistence ?? false,
        cacheSize: opts?.cacheSize ?? 0,
    };
    if (parsedOptions.useRootPersistence === true) {
        if (parsedOptions.root === undefined) {
            parsedOptions.root = await parsedOptions.db.get(key, {
                keyEncoding: util_1.KeyEncoding.Bytes,
                valueEncoding: util_1.ValueEncoding.Bytes,
            });
        }
        else {
            await parsedOptions.db.put(key, parsedOptions.root, {
                keyEncoding: util_1.KeyEncoding.Bytes,
                valueEncoding: util_1.ValueEncoding.Bytes,
            });
        }
    }
    const trie = new verkleTree_js_1.VerkleTree(parsedOptions);
    // If the root node does not exist, initialize the empty root node
    if (parsedOptions.root === undefined)
        await trie.createRootNode();
    return trie;
}
exports.createVerkleTree = createVerkleTree;
//# sourceMappingURL=constructors.js.map