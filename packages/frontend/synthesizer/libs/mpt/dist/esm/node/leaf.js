import { ExtensionOrLeafMPTNodeBase } from './extensionOrLeafNodeBase.js';
export class LeafMPTNode extends ExtensionOrLeafMPTNodeBase {
    constructor(nibbles, value) {
        super(nibbles, value, true);
    }
    raw() {
        return super.raw();
    }
}
//# sourceMappingURL=leaf.js.map