import { BranchMPTNode } from './branch.js';
import { ExtensionMPTNode } from './extension.js';
import { LeafMPTNode } from './leaf.js';
import type { NestedUint8Array } from '@ethereumjs/util';
export declare function decodeRawMPTNode(raw: Uint8Array[]): BranchMPTNode | ExtensionMPTNode | LeafMPTNode;
export declare function isRawMPTNode(n: Uint8Array | NestedUint8Array): n is Uint8Array[];
export declare function decodeMPTNode(node: Uint8Array): BranchMPTNode | ExtensionMPTNode | LeafMPTNode;
//# sourceMappingURL=util.d.ts.map