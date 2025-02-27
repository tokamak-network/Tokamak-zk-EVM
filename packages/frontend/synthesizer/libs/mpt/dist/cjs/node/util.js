"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeMPTNode = exports.isRawMPTNode = exports.decodeRawMPTNode = void 0;
const rlp_1 = require("@ethereumjs/rlp");
const hex_js_1 = require("../util/hex.js");
const nibbles_js_1 = require("../util/nibbles.js");
const branch_js_1 = require("./branch.js");
const extension_js_1 = require("./extension.js");
const leaf_js_1 = require("./leaf.js");
function decodeRawMPTNode(raw) {
    if (raw.length === 17) {
        return branch_js_1.BranchMPTNode.fromArray(raw);
    }
    else if (raw.length === 2) {
        const nibbles = (0, nibbles_js_1.bytesToNibbles)(raw[0]);
        if ((0, hex_js_1.isTerminator)(nibbles)) {
            return new leaf_js_1.LeafMPTNode(leaf_js_1.LeafMPTNode.decodeKey(nibbles), raw[1]);
        }
        return new extension_js_1.ExtensionMPTNode(extension_js_1.ExtensionMPTNode.decodeKey(nibbles), raw[1]);
    }
    else {
        throw new Error('Invalid node');
    }
}
exports.decodeRawMPTNode = decodeRawMPTNode;
function isRawMPTNode(n) {
    return Array.isArray(n) && !(n instanceof Uint8Array);
}
exports.isRawMPTNode = isRawMPTNode;
function decodeMPTNode(node) {
    const decodedNode = rlp_1.RLP.decode(Uint8Array.from(node));
    if (!isRawMPTNode(decodedNode)) {
        throw new Error('Invalid node');
    }
    return decodeRawMPTNode(decodedNode);
}
exports.decodeMPTNode = decodeMPTNode;
//# sourceMappingURL=util.js.map