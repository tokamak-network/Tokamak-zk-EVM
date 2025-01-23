"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMPTFromProof = exports.createMPT = void 0;
const util_1 = require("@ethereumjs/util");
const keccak_1 = require("ethereum-cryptography/keccak");
const utils_1 = require("ethereum-cryptography/utils");
const index_js_1 = require("./index.js");
async function createMPT(opts) {
    const keccakFunction = opts?.common?.customCrypto.keccak256 ?? opts?.useKeyHashingFunction ?? keccak_1.keccak256;
    let key = index_js_1.ROOT_DB_KEY;
    const encoding = opts?.valueEncoding === util_1.ValueEncoding.Bytes ? util_1.ValueEncoding.Bytes : util_1.ValueEncoding.String;
    if (opts?.useKeyHashing === true) {
        key = keccakFunction.call(undefined, index_js_1.ROOT_DB_KEY);
    }
    if (opts?.keyPrefix !== undefined) {
        key = (0, utils_1.concatBytes)(opts.keyPrefix, key);
    }
    if (opts?.db !== undefined && opts?.useRootPersistence === true) {
        if (opts?.root === undefined) {
            const root = await opts?.db.get((0, util_1.bytesToUnprefixedHex)(key), {
                keyEncoding: util_1.KeyEncoding.String,
                valueEncoding: encoding,
            });
            if (typeof root === 'string') {
                opts.root = (0, util_1.unprefixedHexToBytes)(root);
            }
            else {
                opts.root = root;
            }
        }
        else {
            await opts?.db.put((0, util_1.bytesToUnprefixedHex)(key), (encoding === util_1.ValueEncoding.Bytes ? opts.root : (0, util_1.bytesToUnprefixedHex)(opts.root)), {
                keyEncoding: util_1.KeyEncoding.String,
                valueEncoding: encoding,
            });
        }
    }
    return new index_js_1.MerklePatriciaTrie(opts);
}
exports.createMPT = createMPT;
/**
 * Create a trie from a given (EIP-1186)[https://eips.ethereum.org/EIPS/eip-1186] proof. A proof contains the encoded trie nodes
 * from the root node to the leaf node storing state data.
 * @param proof an EIP-1186 proof to create trie from
 * @param trieOpts trie opts to be applied to returned trie
 * @returns new trie created from given proof
 */
async function createMPTFromProof(proof, trieOpts) {
    const shouldVerifyRoot = trieOpts?.root !== undefined;
    const trie = new index_js_1.MerklePatriciaTrie(trieOpts);
    const root = await (0, index_js_1.updateMPTFromMerkleProof)(trie, proof, shouldVerifyRoot);
    trie.root(root);
    await trie.persistRoot();
    return trie;
}
exports.createMPTFromProof = createMPTFromProof;
//# sourceMappingURL=constructors.js.map