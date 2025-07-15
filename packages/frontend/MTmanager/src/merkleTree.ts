import { LeanIMT } from "@zk-kit/lean-imt"
import { poseidon2 } from "poseidon-bls12381"
import { extractStorage } from "./state"
import { toBigInt } from 'ethers'
import { getCurveFromName, F1Field } from "ffjavascript"
import { buildPoseidonWasm } from "circomlibjs"

const bls12381 = await getCurveFromName("BLS12381", true)
const F = bls12381.Fr
const fieldToBigInt = (val: Uint8Array): bigint => toBigInt('0x' + F.toString(val, 16))

// Extract storage state of target address
const L1AddrList: string[] = [
    '0x3F6EE584a7eA3AD7f68C2cd831994Ae8157Aa98a',
    '0x22e30A60FC173b3d4D8e42875250feB3Af371aCf',
    '0xd852b64f4e231746d5b22e1a1c5c4a6b04FEde8a',
    '0xdF0BBB5FEf046EA1e2f39c4A8Aa688911551769b',
    '0xa26e73C8E9507D50bF808B7A2CA9D5dE4fcC4A04',
    '0x772970238fd1587854a30Fcf4f791d8248D21a28',
    '0x85085B8126129729c1Eb7D1446eb6817D749682B',
    '0x100f121DA0C3B3a28600472F74a7815b69F4c872',
]

const L1Addrs = new Set<string>()
for (const addrRaw of L1AddrList) {
    L1Addrs.add(addrRaw.toLowerCase())
}

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const slot = 9 // Balance slot of USDC
const blockNumber = 22920848
const state = await extractStorage(USDC, L1Addrs, slot, blockNumber)

// Hash function used to compute the tree nodes.
const hash = (a: bigint, b: bigint): bigint => poseidon2([a, b])

// To create an instance of a LeanIMT, you must provide the hash function.
const tree = new LeanIMT(hash)

// You can also initialize a tree with a given list of leaves.
// const leaves = [1n, 2n, 3n]
// new LeanIMT(hash, leaves)

// LeanIMT is strictly typed. Default type for nodes is 'bigint',
// but you can set your own type.
// new LeanIMT<number>((a, b) => a + b)

// Insert (incrementally) a leaf with a value of 1.
const gamma = hash(toBigInt(L1AddrList[0]), toBigInt(L1AddrList[1]))
for (const [addr, val] of Object.entries(state)) {
    const addrF = toBigInt(addr)
    const valF = toBigInt(val)
    const RLC = fieldToBigInt(F.e(addrF + gamma * valF + (gamma ** 2n) * valF))
    tree.insert(RLC)
}

console.log(`Root: ${tree.root}`)
console.log(`Depth: ${tree.depth}`)
console.log(`Size: ${tree.size}`)
console.log(`Leaves: ${tree.leaves}`)
