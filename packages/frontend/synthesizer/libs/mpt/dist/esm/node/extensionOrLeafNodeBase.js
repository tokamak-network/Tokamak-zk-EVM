import { RLP } from '@ethereumjs/rlp';
import { addHexPrefix, removeHexPrefix } from '../util/hex.js';
import { nibblesTypeToPackedBytes } from '../util/nibbles.js';
export class ExtensionOrLeafMPTNodeBase {
    constructor(nibbles, value, isLeaf) {
        this._nibbles = nibbles;
        this._value = value;
        this._isLeaf = isLeaf;
    }
    static decodeKey(key) {
        return removeHexPrefix(key);
    }
    encodedKey() {
        return addHexPrefix(this._nibbles.slice(0), this._isLeaf);
    }
    key(k) {
        if (k !== undefined) {
            this._nibbles = k;
        }
        return this._nibbles.slice(0);
    }
    keyLength() {
        return this._nibbles.length;
    }
    value(v) {
        if (v !== undefined) {
            this._value = v;
        }
        return this._value;
    }
    raw() {
        return [nibblesTypeToPackedBytes(this.encodedKey()), this._value];
    }
    serialize() {
        return RLP.encode(this.raw());
    }
}
//# sourceMappingURL=extensionOrLeafNodeBase.js.map