"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DELEGATION_7702_FLAG = exports.EVMMockBlockchain = void 0;
class EVMMockBlockchain {
    async getBlock() {
        return {
            hash() {
                return new Uint8Array(32);
            },
        };
    }
    async putBlock() { }
    shallowCopy() {
        return this;
    }
}
exports.EVMMockBlockchain = EVMMockBlockchain;
// EIP-7702 flag: if contract code starts with these 3 bytes, it is a 7702-delegated EOA
exports.DELEGATION_7702_FLAG = new Uint8Array([0xef, 0x01, 0x00]);
//# sourceMappingURL=types.js.map