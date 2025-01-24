import { ExtensionOrLeafMPTNodeBase } from './extensionOrLeafNodeBase.js';
export class ExtensionMPTNode extends ExtensionOrLeafMPTNodeBase {
    constructor(nibbles, value) {
        super(nibbles, value, false);
    }
    raw() {
        return super.raw();
    }
}
//# sourceMappingURL=extension.js.map