<<<<<<< HEAD
import { type VerkleCrypto } from '@ethereumjs/util';
import type { InternalVerkleNode } from './internalNode.js';
import type { LeafVerkleNode } from './leafNode.js';
export declare enum VerkleNodeType {
    Internal = 0,
    Leaf = 1
}
export interface ChildNode {
    commitment: Uint8Array;
    path: Uint8Array;
}
export interface TypedVerkleNode {
    [VerkleNodeType.Internal]: InternalVerkleNode;
    [VerkleNodeType.Leaf]: LeafVerkleNode;
}
export type VerkleNode = TypedVerkleNode[VerkleNodeType];
export interface VerkleNodeInterface {
    hash(): Uint8Array;
    serialize(): Uint8Array;
}
interface BaseVerkleNodeOptions {
    commitment: Uint8Array;
    verkleCrypto: VerkleCrypto;
}
interface InternalVerkleNodeOptions extends BaseVerkleNodeOptions {
    children?: (ChildNode | null)[];
}
export declare enum LeafVerkleNodeValue {
    Untouched = 0,
    Deleted = 1
}
interface LeafVerkleNodeOptions extends BaseVerkleNodeOptions {
    stem: Uint8Array;
    values?: (Uint8Array | LeafVerkleNodeValue)[];
    c1?: Uint8Array;
    c2?: Uint8Array;
}
export interface VerkleNodeOptions {
    [VerkleNodeType.Internal]: InternalVerkleNodeOptions;
    [VerkleNodeType.Leaf]: LeafVerkleNodeOptions;
}
export declare const NODE_WIDTH = 256;
export {};
=======
import { type VerkleCrypto } from '@synthesizer-libs/util';
import type { InternalVerkleNode } from './internalNode.js';
import type { LeafVerkleNode } from './leafNode.js';
export declare enum VerkleNodeType {
    Internal = 0,
    Leaf = 1
}
export interface ChildNode {
    commitment: Uint8Array;
    path: Uint8Array;
}
export interface TypedVerkleNode {
    [VerkleNodeType.Internal]: InternalVerkleNode;
    [VerkleNodeType.Leaf]: LeafVerkleNode;
}
export type VerkleNode = TypedVerkleNode[VerkleNodeType];
export interface VerkleNodeInterface {
    hash(): Uint8Array;
    serialize(): Uint8Array;
}
interface BaseVerkleNodeOptions {
    commitment: Uint8Array;
    verkleCrypto: VerkleCrypto;
}
interface InternalVerkleNodeOptions extends BaseVerkleNodeOptions {
    children?: (ChildNode | null)[];
}
export declare enum LeafVerkleNodeValue {
    Untouched = 0,
    Deleted = 1
}
interface LeafVerkleNodeOptions extends BaseVerkleNodeOptions {
    stem: Uint8Array;
    values?: (Uint8Array | LeafVerkleNodeValue)[];
    c1?: Uint8Array;
    c2?: Uint8Array;
}
export interface VerkleNodeOptions {
    [VerkleNodeType.Internal]: InternalVerkleNodeOptions;
    [VerkleNodeType.Leaf]: LeafVerkleNodeOptions;
}
export declare const NODE_WIDTH = 256;
export {};
>>>>>>> 603bf51d9e02a58183fabb7f7fd08e9580ceef44
//# sourceMappingURL=types.d.ts.map