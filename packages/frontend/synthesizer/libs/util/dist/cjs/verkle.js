"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCodeStems = exports.generateChunkSuffixes = exports.encodeVerkleLeafBasicData = exports.decodeVerkleLeafBasicData = exports.getVerkleTreeKeyForStorageSlot = exports.chunkifyCode = exports.getVerkleTreeKeyForCodeChunk = exports.getVerkleTreeIndicesForCodeChunk = exports.getVerkleTreeIndicesForStorageSlot = exports.getVerkleKey = exports.VERKLE_MAIN_STORAGE_OFFSET = exports.VERKLE_NODE_WIDTH = exports.VERKLE_CODE_OFFSET = exports.VERKLE_HEADER_STORAGE_OFFSET = exports.VERKLE_CODE_CHUNK_SIZE = exports.VERKLE_CODE_HASH_LEAF_KEY = exports.VERKLE_BASIC_DATA_LEAF_KEY = exports.VERKLE_BALANCE_BYTES_LENGTH = exports.VERKLE_NONCE_BYTES_LENGTH = exports.VERKLE_CODE_SIZE_BYTES_LENGTH = exports.VERKLE_VERSION_BYTES_LENGTH = exports.VERKLE_BALANCE_OFFSET = exports.VERKLE_NONCE_OFFSET = exports.VERKLE_CODE_SIZE_OFFSET = exports.VERKLE_VERSION_OFFSET = exports.VerkleLeafType = exports.verifyVerkleProof = exports.getVerkleStem = void 0;
const bytes_js_1 = require("./bytes.js");
/**
 * @dev Returns the 31-bytes verkle tree stem for a given address and tree index.
 * @dev Assumes that the verkle node width = 256
 * @param {VerkleCrypto} verkleCrypto The {@link VerkleCrypto} foreign function interface object from verkle-cryptography-wasm.
 * @param {Address} address The address to generate the tree key for.
 * @param treeIndex The index of the tree to generate the key for. Defaults to 0.
 * @return The 31-bytes verkle tree stem as a Uint8Array.
 */
function getVerkleStem(verkleCrypto, address, treeIndex = 0) {
    const address32 = (0, bytes_js_1.setLengthLeft)(address.toBytes(), 32);
    let treeIndexBytes;
    if (typeof treeIndex === 'number') {
        treeIndexBytes = (0, bytes_js_1.setLengthRight)((0, bytes_js_1.int32ToBytes)(Number(treeIndex), true), 32);
    }
    else {
        treeIndexBytes = (0, bytes_js_1.setLengthRight)((0, bytes_js_1.bigIntToBytes)(BigInt(treeIndex), true).slice(0, 32), 32);
    }
    const treeStem = verkleCrypto.getTreeKey(address32, treeIndexBytes, 0).slice(0, 31);
    return treeStem;
}
exports.getVerkleStem = getVerkleStem;
/**
 * Verifies that the executionWitness is valid for the given prestateRoot.
 * @param {VerkleCrypto} verkleCrypto The {@link VerkleCrypto} foreign function interface object from verkle-cryptography-wasm.
 * @param {VerkleExecutionWitness} executionWitness The verkle execution witness.
 * @returns {boolean} Whether or not the executionWitness belongs to the prestateRoot.
 */
function verifyVerkleProof(verkleCrypto, executionWitness) {
    const { parentStateRoot, ...parsedExecutionWitness } = executionWitness;
    return verkleCrypto.verifyExecutionWitnessPreState(parentStateRoot, JSON.stringify(parsedExecutionWitness));
}
exports.verifyVerkleProof = verifyVerkleProof;
var VerkleLeafType;
(function (VerkleLeafType) {
    VerkleLeafType[VerkleLeafType["BasicData"] = 0] = "BasicData";
    VerkleLeafType[VerkleLeafType["CodeHash"] = 1] = "CodeHash";
})(VerkleLeafType = exports.VerkleLeafType || (exports.VerkleLeafType = {}));
exports.VERKLE_VERSION_OFFSET = 0;
exports.VERKLE_CODE_SIZE_OFFSET = 5;
exports.VERKLE_NONCE_OFFSET = 8;
exports.VERKLE_BALANCE_OFFSET = 16;
exports.VERKLE_VERSION_BYTES_LENGTH = 1;
exports.VERKLE_CODE_SIZE_BYTES_LENGTH = 3;
exports.VERKLE_NONCE_BYTES_LENGTH = 8;
exports.VERKLE_BALANCE_BYTES_LENGTH = 16;
exports.VERKLE_BASIC_DATA_LEAF_KEY = (0, bytes_js_1.intToBytes)(VerkleLeafType.BasicData);
exports.VERKLE_CODE_HASH_LEAF_KEY = (0, bytes_js_1.intToBytes)(VerkleLeafType.CodeHash);
exports.VERKLE_CODE_CHUNK_SIZE = 31;
exports.VERKLE_HEADER_STORAGE_OFFSET = 64;
exports.VERKLE_CODE_OFFSET = 128;
exports.VERKLE_NODE_WIDTH = 256;
exports.VERKLE_MAIN_STORAGE_OFFSET = BigInt(256) ** BigInt(exports.VERKLE_CODE_CHUNK_SIZE);
/**
 * @dev Returns the tree key for a given verkle tree stem, and sub index.
 * @dev Assumes that the verkle node width = 256
 * @param stem The 31-bytes verkle tree stem as a Uint8Array.
 * @param subIndex The sub index of the tree to generate the key for as a Uint8Array.
 * @return The tree key as a Uint8Array.
 */
const getVerkleKey = (stem, leaf) => {
    switch (leaf) {
        case VerkleLeafType.BasicData:
            return (0, bytes_js_1.concatBytes)(stem, exports.VERKLE_BASIC_DATA_LEAF_KEY);
        case VerkleLeafType.CodeHash:
            return (0, bytes_js_1.concatBytes)(stem, exports.VERKLE_CODE_HASH_LEAF_KEY);
        default:
            return (0, bytes_js_1.concatBytes)(stem, leaf);
    }
};
exports.getVerkleKey = getVerkleKey;
/**
 * Calculates the position of the storage key in the Verkle tree, determining
 * both the tree index (the node in the tree) and the subindex (the position within the node).
 * @param {bigint} storageKey - The key representing a specific storage slot.
 * @returns {Object} - An object containing the tree index and subindex
 */
function getVerkleTreeIndicesForStorageSlot(storageKey) {
    let position;
    if (storageKey < exports.VERKLE_CODE_OFFSET - exports.VERKLE_HEADER_STORAGE_OFFSET) {
        position = BigInt(exports.VERKLE_HEADER_STORAGE_OFFSET) + storageKey;
    }
    else {
        position = exports.VERKLE_MAIN_STORAGE_OFFSET + storageKey;
    }
    const treeIndex = position / BigInt(exports.VERKLE_NODE_WIDTH);
    const subIndex = Number(position % BigInt(exports.VERKLE_NODE_WIDTH));
    return { treeIndex, subIndex };
}
exports.getVerkleTreeIndicesForStorageSlot = getVerkleTreeIndicesForStorageSlot;
/**
 * Calculates the position of the code chunks in the Verkle tree, determining
 * both the tree index (the node in the tree) and the subindex (the position within the node).
 * @param {bigint} chunkId - The ID representing a specific chunk.
 * @returns {Object} - An object containing the tree index and subindex
 */
function getVerkleTreeIndicesForCodeChunk(chunkId) {
    const treeIndex = Math.floor((exports.VERKLE_CODE_OFFSET + chunkId) / exports.VERKLE_NODE_WIDTH);
    const subIndex = (exports.VERKLE_CODE_OFFSET + chunkId) % exports.VERKLE_NODE_WIDTH;
    return { treeIndex, subIndex };
}
exports.getVerkleTreeIndicesForCodeChunk = getVerkleTreeIndicesForCodeChunk;
/**
 * Asynchronously calculates the Verkle tree key for the specified code chunk ID.
 * @param {Address} address - The account address to access code for.
 * @param {number} chunkId - The ID of the code chunk to retrieve.
 * @param {VerkleCrypto} verkleCrypto - The cryptographic object used for Verkle-related operations.
 * @returns {Promise<Uint8Array>} - A promise that resolves to the Verkle tree key as a byte array.
 */
const getVerkleTreeKeyForCodeChunk = async (address, chunkId, verkleCrypto) => {
    const { treeIndex, subIndex } = getVerkleTreeIndicesForCodeChunk(chunkId);
    return (0, bytes_js_1.concatBytes)(getVerkleStem(verkleCrypto, address, treeIndex), (0, bytes_js_1.toBytes)(subIndex));
};
exports.getVerkleTreeKeyForCodeChunk = getVerkleTreeKeyForCodeChunk;
const chunkifyCode = (code) => {
    if (code.length === 0)
        return [];
    // Pad code to multiple of VERKLE_CODE_CHUNK_SIZE bytes
    if (code.length % exports.VERKLE_CODE_CHUNK_SIZE !== 0) {
        const paddingLength = exports.VERKLE_CODE_CHUNK_SIZE - (code.length % exports.VERKLE_CODE_CHUNK_SIZE);
        code = (0, bytes_js_1.setLengthRight)(code, code.length + paddingLength);
    }
    // Put first chunk (leading byte is always 0 since we have no leading PUSHDATA bytes)
    const chunks = [(0, bytes_js_1.concatBytes)(new Uint8Array(1), code.subarray(0, 31))];
    for (let i = 1; i < Math.floor(code.length / 31); i++) {
        const slice = code.slice((i - 1) * 31, i * 31);
        let x = 31;
        while (x >= 0) {
            // Look for last push instruction in code chunk
            if (slice[x] > 0x5f && slice[x] < 0x80)
                break;
            x--;
        }
        if (x >= 0 && slice[x] - 0x5f > 31 - x) {
            // x >= 0 indicates PUSHn in this chunk
            // n > 31 - x indicates that PUSHDATA spills over to next chunk
            // PUSHDATA overflow = n - 31 - x + 1(i.e. number of elements PUSHed
            // - size of code chunk (31) - position of PUSHn in the previous
            // code chunk + 1 (since x is zero-indexed))
            const pushDataOverflow = slice[x] - 0x5f - 31 - x + 1;
            // Put next chunk prepended with number of overflow PUSHDATA bytes
            chunks.push((0, bytes_js_1.concatBytes)(Uint8Array.from([pushDataOverflow]), code.slice(i * 31, (i + 1) * 31)));
        }
        else {
            // Put next chunk prepended with 0 (i.e. no overflow PUSHDATA bytes from previous chunk)
            chunks.push((0, bytes_js_1.concatBytes)(new Uint8Array(1), code.slice(i * 31, (i + 1) * 31)));
        }
    }
    return chunks;
};
exports.chunkifyCode = chunkifyCode;
/**
 * Asynchronously calculates the Verkle tree key for the specified storage slot.
 * @param {Address} address - The account address to access code for.
 * @param {bigint} storageKey - The storage slot key to retrieve the verkle key for.
 * @param {VerkleCrypto} verkleCrypto - The cryptographic object used for Verkle-related operations.
 * @returns {Promise<Uint8Array>} - A promise that resolves to the Verkle tree key as a byte array.
 */
const getVerkleTreeKeyForStorageSlot = async (address, storageKey, verkleCrypto) => {
    const { treeIndex, subIndex } = getVerkleTreeIndicesForStorageSlot(storageKey);
    return (0, bytes_js_1.concatBytes)(getVerkleStem(verkleCrypto, address, treeIndex), (0, bytes_js_1.toBytes)(subIndex));
};
exports.getVerkleTreeKeyForStorageSlot = getVerkleTreeKeyForStorageSlot;
/**
 * This function extracts and decodes account header elements (version, nonce, code size, and balance)
 * from an encoded `Uint8Array` representation of raw Verkle leaf-node basic data. Each component is sliced
 * from the `encodedBasicData` array based on predefined offsets and lengths, and then converted
 * to its appropriate type (integer or BigInt).
 * @param {Uint8Array} encodedBasicData - The encoded Verkle leaf basic data containing the version, nonce,
 * code size, and balance in a compact Uint8Array format.
 * @returns {VerkleLeafBasicData} - An object containing the decoded version, nonce, code size, and balance.
 */
function decodeVerkleLeafBasicData(encodedBasicData) {
    const versionBytes = encodedBasicData.slice(0, exports.VERKLE_VERSION_BYTES_LENGTH);
    const nonceBytes = encodedBasicData.slice(exports.VERKLE_NONCE_OFFSET, exports.VERKLE_NONCE_OFFSET + exports.VERKLE_NONCE_BYTES_LENGTH);
    const codeSizeBytes = encodedBasicData.slice(exports.VERKLE_CODE_SIZE_OFFSET, exports.VERKLE_CODE_SIZE_OFFSET + exports.VERKLE_CODE_SIZE_BYTES_LENGTH);
    const balanceBytes = encodedBasicData.slice(exports.VERKLE_BALANCE_OFFSET, exports.VERKLE_BALANCE_OFFSET + exports.VERKLE_BALANCE_BYTES_LENGTH);
    const version = (0, bytes_js_1.bytesToInt32)(versionBytes);
    const nonce = (0, bytes_js_1.bytesToBigInt)(nonceBytes);
    const codeSize = (0, bytes_js_1.bytesToInt32)(codeSizeBytes);
    const balance = (0, bytes_js_1.bytesToBigInt)(balanceBytes);
    return { version, nonce, codeSize, balance };
}
exports.decodeVerkleLeafBasicData = decodeVerkleLeafBasicData;
/**
 * This function takes a `VerkleLeafBasicData` object and encodes its properties
 * (version, nonce, code size, and balance) into a compact `Uint8Array` format. Each
 * property is serialized and padded to match the required byte lengths defined by
 * EIP-6800. Additionally, 4 bytes are reserved for future use as specified
 * in EIP-6800.
 * @param {VerkleLeafBasicData} basicData - An object containing the version, nonce,
 *   code size, and balance to be encoded.
 * @returns {Uint8Array} - A compact bytes representation of the account header basic data.
 */
function encodeVerkleLeafBasicData(account) {
    const encodedVersion = (0, bytes_js_1.setLengthLeft)((0, bytes_js_1.int32ToBytes)(account.version), exports.VERKLE_VERSION_BYTES_LENGTH);
    // Per EIP-6800, bytes 1-4 are reserved for future use
    const reservedBytes = new Uint8Array([0, 0, 0, 0]);
    const encodedNonce = (0, bytes_js_1.setLengthLeft)((0, bytes_js_1.bigIntToBytes)(account.nonce), exports.VERKLE_NONCE_BYTES_LENGTH);
    const encodedCodeSize = (0, bytes_js_1.setLengthLeft)((0, bytes_js_1.int32ToBytes)(account.codeSize), exports.VERKLE_CODE_SIZE_BYTES_LENGTH);
    const encodedBalance = (0, bytes_js_1.setLengthLeft)((0, bytes_js_1.bigIntToBytes)(account.balance), exports.VERKLE_BALANCE_BYTES_LENGTH);
    return (0, bytes_js_1.concatBytes)(encodedVersion, reservedBytes, encodedCodeSize, encodedNonce, encodedBalance);
}
exports.encodeVerkleLeafBasicData = encodeVerkleLeafBasicData;
/**
 * Helper method to generate the suffixes for code chunks for putting code
 * @param numChunks number of chunks to generate suffixes for
 * @returns number[] - an array of numbers corresponding to the code chunks being put
 */
const generateChunkSuffixes = (numChunks) => {
    if (numChunks === 0)
        return [];
    const chunkSuffixes = new Array(numChunks);
    const firstChunksSet = numChunks > exports.VERKLE_CODE_OFFSET ? exports.VERKLE_CODE_OFFSET : numChunks;
    for (let x = 0; x < firstChunksSet; x++) {
        // Fill up to first 128 suffixes
        chunkSuffixes[x] = x + exports.VERKLE_CODE_OFFSET;
    }
    if (numChunks > exports.VERKLE_CODE_OFFSET) {
        for (let x = exports.VERKLE_CODE_OFFSET; x < numChunks; x++) {
            // Fill subsequent chunk suffixes up to 256 and then start over since a single node
            chunkSuffixes[x] = x - Math.floor(x / exports.VERKLE_NODE_WIDTH) * exports.VERKLE_NODE_WIDTH;
        }
    }
    return chunkSuffixes;
};
exports.generateChunkSuffixes = generateChunkSuffixes;
/**
 * Helper method for generating the code stems necessary for putting code
 * @param numChunks the number of code chunks to be put
 * @param address the address of the account getting the code
 * @param verkleCrypto an initialized {@link VerkleCrypto} object
 * @returns an array of stems for putting code
 */
const generateCodeStems = async (numChunks, address, verkleCrypto) => {
    // The maximum number of chunks is 793 (maxCodeSize - 24576) / (bytes per chunk 31) + (round up - 1)
    // Code is stored in chunks starting at leaf index 128 of the leaf node corresponding to the stem of the code's address
    // Code chunks beyond the initial 128 are stored in additional leaf nodes in batches up of up to 256 chunks per leaf node
    // so the maximum number of leaf nodes that can hold contract code for a specific address is 4 leaf nodes (128 chunks in
    // the first leaf node and 256 chunks in up to 3 additional leaf nodes)
    // So, instead of computing every single leaf key (which is a heavy async operation), we just compute the stem for the first
    // chunk in each leaf node and can then know that the chunks in between have tree keys in monotonically increasing order
    const numStems = Math.ceil(numChunks / exports.VERKLE_NODE_WIDTH);
    const chunkStems = new Array(numStems);
    // Compute the stem for the initial set of code chunks
    chunkStems[0] = (await (0, exports.getVerkleTreeKeyForCodeChunk)(address, 0, verkleCrypto)).slice(0, 31);
    for (let stemNum = 0; stemNum < numStems - 1; stemNum++) {
        // Generate additional stems
        const firstChunkKey = await (0, exports.getVerkleTreeKeyForCodeChunk)(address, exports.VERKLE_CODE_OFFSET + stemNum * exports.VERKLE_NODE_WIDTH, verkleCrypto);
        chunkStems[stemNum + 1] = firstChunkKey.slice(0, 31);
    }
    return chunkStems;
};
exports.generateCodeStems = generateCodeStems;
//# sourceMappingURL=verkle.js.map