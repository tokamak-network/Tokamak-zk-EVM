import type { BranchMPTNodeBranchValue, NodeReferenceOrRawMPTNode } from '../types.js';
export declare class BranchMPTNode {
    _branches: BranchMPTNodeBranchValue[];
    _value: Uint8Array | null;
    constructor();
    static fromArray(arr: Uint8Array[]): BranchMPTNode;
    value(v?: Uint8Array | null): Uint8Array | null;
    setBranch(i: number, v: BranchMPTNodeBranchValue): void;
    raw(): BranchMPTNodeBranchValue[];
    serialize(): Uint8Array;
    getBranch(i: number): BranchMPTNodeBranchValue;
    getChildren(): [number, NodeReferenceOrRawMPTNode][];
}
//# sourceMappingURL=branch.d.ts.map