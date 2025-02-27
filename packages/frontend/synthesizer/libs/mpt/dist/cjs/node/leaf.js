"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeafMPTNode = void 0;
const extensionOrLeafNodeBase_js_1 = require("./extensionOrLeafNodeBase.js");
class LeafMPTNode extends extensionOrLeafNodeBase_js_1.ExtensionOrLeafMPTNodeBase {
    constructor(nibbles, value) {
        super(nibbles, value, true);
    }
    raw() {
        return super.raw();
    }
}
exports.LeafMPTNode = LeafMPTNode;
//# sourceMappingURL=leaf.js.map