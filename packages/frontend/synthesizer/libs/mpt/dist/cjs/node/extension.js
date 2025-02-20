"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExtensionMPTNode = void 0;
const extensionOrLeafNodeBase_js_1 = require("./extensionOrLeafNodeBase.js");
class ExtensionMPTNode extends extensionOrLeafNodeBase_js_1.ExtensionOrLeafMPTNodeBase {
    constructor(nibbles, value) {
        super(nibbles, value, false);
    }
    raw() {
        return super.raw();
    }
}
exports.ExtensionMPTNode = ExtensionMPTNode;
//# sourceMappingURL=extension.js.map