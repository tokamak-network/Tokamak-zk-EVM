import { RLP } from '@ethereumjs/rlp'

import { isTerminator } from '../util/hex.js'
import { bytesToNibbles } from '../util/nibbles.js'

import { BranchMPTNode } from './branch.js'
import { ExtensionMPTNode } from './extension.js'
import { LeafMPTNode } from './leaf.js'

import type { NestedUint8Array } from '@synthesizer-libs/util'

export function decodeRawMPTNode(raw: Uint8Array[]) {
  if (raw.length === 17) {
    return BranchMPTNode.fromArray(raw)
  } else if (raw.length === 2) {
    const nibbles = bytesToNibbles(raw[0])
    if (isTerminator(nibbles)) {
      return new LeafMPTNode(LeafMPTNode.decodeKey(nibbles), raw[1])
    }
    return new ExtensionMPTNode(ExtensionMPTNode.decodeKey(nibbles), raw[1])
  } else {
    throw new Error('Invalid node')
  }
}

export function isRawMPTNode(n: Uint8Array | NestedUint8Array): n is Uint8Array[] {
  return Array.isArray(n) && !(n instanceof Uint8Array)
}

export function decodeMPTNode(node: Uint8Array) {
  const decodedNode = RLP.decode(Uint8Array.from(node))
  if (!isRawMPTNode(decodedNode)) {
    throw new Error('Invalid node')
  }
  return decodeRawMPTNode(decodedNode)
}
