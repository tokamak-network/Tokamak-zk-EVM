import { ExtensionOrLeafMPTNodeBase } from './extensionOrLeafNodeBase.js';
import type { Nibbles, RawLeafMPTNode } from '../types.js';
export declare class LeafMPTNode extends ExtensionOrLeafMPTNodeBase {
    constructor(nibbles: Nibbles, value: Uint8Array);
    raw(): RawLeafMPTNode;
}
//# sourceMappingURL=leaf.d.ts.map