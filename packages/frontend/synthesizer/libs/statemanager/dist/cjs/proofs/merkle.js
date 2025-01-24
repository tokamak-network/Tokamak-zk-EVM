"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyMerkleStateProof = exports.addMerkleStateProofData = exports.fromMerkleStateProof = exports.addMerkleStateStorageProof = exports.getMerkleStateProof = void 0;
const mpt_1 = require("@ethereumjs/mpt");
const rlp_1 = require("@ethereumjs/rlp");
const util_1 = require("@ethereumjs/util");
const merkleStateManager_js_1 = require("../merkleStateManager.js");
/**
 * Get an EIP-1186 proof
 * @param address address to get proof of
 * @param storageSlots storage slots to get proof of
 */
async function getMerkleStateProof(sm, address, storageSlots = []) {
    await sm['flush']();
    const account = await sm.getAccount(address);
    if (!account) {
        const returnValue = {
            address: address.toString(),
            balance: '0x0',
            codeHash: util_1.KECCAK256_NULL_S,
            nonce: '0x0',
            storageHash: util_1.KECCAK256_RLP_S,
            accountProof: (await (0, mpt_1.createMerkleProof)(sm['_trie'], address.bytes)).map((p) => (0, util_1.bytesToHex)(p)),
            storageProof: [],
        };
        return returnValue;
    }
    const accountProof = (await (0, mpt_1.createMerkleProof)(sm['_trie'], address.bytes)).map((p) => (0, util_1.bytesToHex)(p));
    const storageProof = [];
    const storageTrie = sm['_getStorageTrie'](address, account);
    for (const storageKey of storageSlots) {
        const proof = (await (0, mpt_1.createMerkleProof)(storageTrie, storageKey)).map((p) => (0, util_1.bytesToHex)(p));
        const value = (0, util_1.bytesToHex)(await sm.getStorage(address, storageKey));
        const proofItem = {
            key: (0, util_1.bytesToHex)(storageKey),
            value: value === '0x' ? '0x0' : value,
            proof,
        };
        storageProof.push(proofItem);
    }
    const returnValue = {
        address: address.toString(),
        balance: (0, util_1.bigIntToHex)(account.balance),
        codeHash: (0, util_1.bytesToHex)(account.codeHash),
        nonce: (0, util_1.bigIntToHex)(account.nonce),
        storageHash: (0, util_1.bytesToHex)(account.storageRoot),
        accountProof,
        storageProof,
    };
    return returnValue;
}
exports.getMerkleStateProof = getMerkleStateProof;
/**
 * Adds a storage proof to the state manager
 * @param storageProof The storage proof
 * @param storageHash The root hash of the storage trie
 * @param address The address
 * @param safe Whether or not to verify if the reported roots match the current storage root
 */
async function addMerkleStateStorageProof(sm, storageProof, storageHash, address, safe = false) {
    const trie = sm['_getStorageTrie'](address);
    trie.root((0, util_1.hexToBytes)(storageHash));
    for (let i = 0; i < storageProof.length; i++) {
        await (0, mpt_1.updateMPTFromMerkleProof)(trie, storageProof[i].proof.map((e) => (0, util_1.hexToBytes)(e)), safe);
    }
}
exports.addMerkleStateStorageProof = addMerkleStateStorageProof;
/**
 * Create a StateManager and initialize this with proof(s) gotten previously from getProof
 * This generates a (partial) StateManager where one can retrieve all items from the proof
 * @param proof Either a proof retrieved from `getProof`, or an array of those proofs
 * @param safe Whether or not to verify that the roots of the proof items match the reported roots
 * @param opts a dictionary of StateManager opts
 * @returns A new MerkleStateManager with elements from the given proof included in its backing state trie
 */
async function fromMerkleStateProof(proof, safe = false, opts = {}) {
    if (Array.isArray(proof)) {
        if (proof.length === 0) {
            return new merkleStateManager_js_1.MerkleStateManager(opts);
        }
        else {
            const trie = opts.trie ??
                (await (0, mpt_1.createMPTFromProof)(proof[0].accountProof.map((e) => (0, util_1.hexToBytes)(e)), { useKeyHashing: true }));
            const sm = new merkleStateManager_js_1.MerkleStateManager({ ...opts, trie });
            const address = (0, util_1.createAddressFromString)(proof[0].address);
            await addMerkleStateStorageProof(sm, proof[0].storageProof, proof[0].storageHash, address, safe);
            for (let i = 1; i < proof.length; i++) {
                const proofItem = proof[i];
                await addMerkleStateProofData(sm, proofItem, true);
            }
            await sm.flush(); // TODO verify if this is necessary
            return sm;
        }
    }
    else {
        return fromMerkleStateProof([proof], safe, opts);
    }
}
exports.fromMerkleStateProof = fromMerkleStateProof;
/**
 * Add proof(s) into an already existing trie
 * @param proof The proof(s) retrieved from `getProof`
 * @param verifyRoot verify that all proof root nodes match statemanager's stateroot - should be
 * set to `false` when constructing a state manager where the underlying trie has proof nodes from different state roots
 */
async function addMerkleStateProofData(sm, proof, safe = false) {
    if (Array.isArray(proof)) {
        for (let i = 0; i < proof.length; i++) {
            await (0, mpt_1.updateMPTFromMerkleProof)(sm['_trie'], proof[i].accountProof.map((e) => (0, util_1.hexToBytes)(e)), safe);
            await addMerkleStateStorageProof(sm, proof[i].storageProof, proof[i].storageHash, (0, util_1.createAddressFromString)(proof[i].address), safe);
        }
    }
    else {
        await addMerkleStateProofData(sm, [proof], safe);
    }
}
exports.addMerkleStateProofData = addMerkleStateProofData;
/**
 * Verify an EIP-1186 proof. Throws if proof is invalid, otherwise returns true.
 * @param proof the proof to prove
 */
async function verifyMerkleStateProof(sm, proof) {
    const key = (0, util_1.hexToBytes)(proof.address);
    const accountProof = proof.accountProof.map((rlpString) => (0, util_1.hexToBytes)(rlpString));
    // This returns the account if the proof is valid.
    // Verify that it matches the reported account.
    const value = await (0, mpt_1.verifyMerkleProof)(key, accountProof, {
        useKeyHashing: true,
    });
    if (value === null) {
        // Verify that the account is empty in the proof.
        const emptyBytes = new Uint8Array(0);
        const notEmptyErrorMsg = 'Invalid proof provided: account is not empty';
        const nonce = (0, util_1.unpadBytes)((0, util_1.hexToBytes)(proof.nonce));
        if (!(0, util_1.equalsBytes)(nonce, emptyBytes)) {
            throw new Error(`${notEmptyErrorMsg} (nonce is not zero)`);
        }
        const balance = (0, util_1.unpadBytes)((0, util_1.hexToBytes)(proof.balance));
        if (!(0, util_1.equalsBytes)(balance, emptyBytes)) {
            throw new Error(`${notEmptyErrorMsg} (balance is not zero)`);
        }
        const storageHash = (0, util_1.hexToBytes)(proof.storageHash);
        if (!(0, util_1.equalsBytes)(storageHash, util_1.KECCAK256_RLP)) {
            throw new Error(`${notEmptyErrorMsg} (storageHash does not equal KECCAK256_RLP)`);
        }
        const codeHash = (0, util_1.hexToBytes)(proof.codeHash);
        if (!(0, util_1.equalsBytes)(codeHash, util_1.KECCAK256_NULL)) {
            throw new Error(`${notEmptyErrorMsg} (codeHash does not equal KECCAK256_NULL)`);
        }
    }
    else {
        const account = (0, util_1.createAccountFromRLP)(value);
        const { nonce, balance, storageRoot, codeHash } = account;
        const invalidErrorMsg = 'Invalid proof provided:';
        if (nonce !== BigInt(proof.nonce)) {
            throw new Error(`${invalidErrorMsg} nonce does not match`);
        }
        if (balance !== BigInt(proof.balance)) {
            throw new Error(`${invalidErrorMsg} balance does not match`);
        }
        if (!(0, util_1.equalsBytes)(storageRoot, (0, util_1.hexToBytes)(proof.storageHash))) {
            throw new Error(`${invalidErrorMsg} storageHash does not match`);
        }
        if (!(0, util_1.equalsBytes)(codeHash, (0, util_1.hexToBytes)(proof.codeHash))) {
            throw new Error(`${invalidErrorMsg} codeHash does not match`);
        }
    }
    for (const stProof of proof.storageProof) {
        const storageProof = stProof.proof.map((value) => (0, util_1.hexToBytes)(value));
        const storageValue = (0, util_1.setLengthLeft)((0, util_1.hexToBytes)(stProof.value), 32);
        const storageKey = (0, util_1.hexToBytes)(stProof.key);
        const proofValue = await (0, mpt_1.verifyMerkleProof)(storageKey, storageProof, {
            useKeyHashing: true,
        });
        const reportedValue = (0, util_1.setLengthLeft)(rlp_1.RLP.decode(proofValue ?? new Uint8Array(0)), 32);
        if (!(0, util_1.equalsBytes)(reportedValue, storageValue)) {
            throw new Error(`Reported trie value does not match storage, key: ${stProof.key}, reported: ${(0, util_1.bytesToHex)(reportedValue)}, actual: ${(0, util_1.bytesToHex)(storageValue)}`);
        }
    }
    return true;
}
exports.verifyMerkleStateProof = verifyMerkleStateProof;
//# sourceMappingURL=merkle.js.map