import type { Nibbles, RawExtensionMPTNode, RawLeafMPTNode } from '../types.js';
export declare abstract class ExtensionOrLeafMPTNodeBase {
    _nibbles: Nibbles;
    _value: Uint8Array;
    _isLeaf: boolean;
    constructor(nibbles: Nibbles, value: Uint8Array, isLeaf: boolean);
    static decodeKey(key: Nibbles): Nibbles;
    encodedKey(): Nibbles;
    key(k?: Nibbles): Nibbles;
    keyLength(): number;
    value(v?: Uint8Array): Uint8Array;
    raw(): RawExtensionMPTNode | RawLeafMPTNode;
    serialize(): Uint8Array;
}
//# sourceMappingURL=extensionOrLeafNodeBase.d.ts.map