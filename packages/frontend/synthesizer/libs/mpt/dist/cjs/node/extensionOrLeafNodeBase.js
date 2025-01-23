"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExtensionOrLeafMPTNodeBase = void 0;
const rlp_1 = require("@ethereumjs/rlp");
const hex_js_1 = require("../util/hex.js");
const nibbles_js_1 = require("../util/nibbles.js");
class ExtensionOrLeafMPTNodeBase {
    constructor(nibbles, value, isLeaf) {
        this._nibbles = nibbles;
        this._value = value;
        this._isLeaf = isLeaf;
    }
    static decodeKey(key) {
        return (0, hex_js_1.removeHexPrefix)(key);
    }
    encodedKey() {
        return (0, hex_js_1.addHexPrefix)(this._nibbles.slice(0), this._isLeaf);
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
        return [(0, nibbles_js_1.nibblesTypeToPackedBytes)(this.encodedKey()), this._value];
    }
    serialize() {
        return rlp_1.RLP.encode(this.raw());
    }
}
exports.ExtensionOrLeafMPTNodeBase = ExtensionOrLeafMPTNodeBase;
//# sourceMappingURL=extensionOrLeafNodeBase.js.map