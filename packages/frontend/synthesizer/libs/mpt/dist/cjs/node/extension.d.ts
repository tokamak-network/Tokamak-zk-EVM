import { ExtensionOrLeafMPTNodeBase } from './extensionOrLeafNodeBase.js';
import type { Nibbles, RawExtensionMPTNode } from '../types.js';
export declare class ExtensionMPTNode extends ExtensionOrLeafMPTNodeBase {
    constructor(nibbles: Nibbles, value: Uint8Array);
    raw(): RawExtensionMPTNode;
}
//# sourceMappingURL=extension.d.ts.map