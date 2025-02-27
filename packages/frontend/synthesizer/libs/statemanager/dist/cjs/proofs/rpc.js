"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRPCStateProof = void 0;
const util_1 = require("@synthesizer-libs/util");
/**
 * Get an EIP-1186 proof from the provider
 * @param address address to get proof of
 * @param storageSlots storage slots to get proof of
 * @returns an EIP-1186 formatted proof
 */
async function getRPCStateProof(sm, address, storageSlots = []) {
    if (sm['DEBUG'])
        sm['_debug'](`retrieving proof from provider for ${address.toString()}`);
    const proof = await (0, util_1.fetchFromProvider)(sm['_provider'], {
        method: 'eth_getProof',
        params: [address.toString(), storageSlots.map(util_1.bytesToHex), sm['_blockTag']],
    });
    return proof;
}
exports.getRPCStateProof = getRPCStateProof;
//# sourceMappingURL=rpc.js.map