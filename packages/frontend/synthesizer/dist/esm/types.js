export class EVMMockBlockchain {
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
// EIP-7702 flag: if contract code starts with these 3 bytes, it is a 7702-delegated EOA
export const DELEGATION_7702_FLAG = new Uint8Array([0xef, 0x01, 0x00]);
//# sourceMappingURL=types.js.map