import { addHexPrefix, Address, bigIntToBytes, concatBytes, hexToBigInt, hexToBytes, setLengthLeft } from "@ethereumjs/util"
import { EdwardsPoint } from "@noble/curves/abstract/edwards"
import { jubjub } from "@noble/curves/misc"
import { poseidon } from "../crypto/index.ts"
import { SynthesizerBlockInfo } from "src/tokamak/types/synthesizer.ts"
import { ethers } from "ethers"



export function batchBigIntTo32BytesEach(...inVals: bigint[]): Uint8Array {
    return concatBytes(...inVals.map(x => setLengthLeft(bigIntToBytes(x), 32)))
}

export function fromEdwardsToAddress(point: EdwardsPoint | Uint8Array): Address {
    if(Array.isArray(point)) {
        if (point.length !== 64) {
            throw new Error('Invalid Edwards point')
        }
        point = jubjub.Point.fromBytes(point as Uint8Array)
    }
    const addressByte = poseidon(batchBigIntTo32BytesEach((point as EdwardsPoint).X, (point as EdwardsPoint).Y)).subarray(-20)
    return new Address(addressByte)
}

export function compressJubJubPoint(point: EdwardsPoint): bigint {
    return point.X * jubjub.Point.Fp.ORDER + point.Y
}

export function recoverJubJubPoint(raw: bigint): EdwardsPoint {
    const Y = raw % jubjub.Point.Fp.ORDER
    const X = (raw - Y) / jubjub.Point.Fp.ORDER
    if (X >= jubjub.Point.Fp.ORDER) {
        throw new Error('Invalid format for a JubJub point')
    }
    return jubjub.Point.fromAffine({x: X, y: Y})
}

export function getTokamakL2UserStorageKey(parts: Array<Address | number | bigint | string>): Uint8Array {
    const bytesArray: Uint8Array[] = []

    for (const p of parts) {
        let b: Uint8Array

        if (p instanceof Address) {
        b = p.toBytes()
        } else if (typeof p === 'number') {
        b = bigIntToBytes(BigInt(p))
        } else if (typeof p === 'bigint') {
        b = bigIntToBytes(p)
        } else if (typeof p === 'string') {
        b = hexToBytes(addHexPrefix(p))
        } else {
        throw new Error('getStorageKey accepts only Address | number | bigint | string');
        }

        bytesArray.push(setLengthLeft(b, 32))
    }

    return poseidon(concatBytes(...bytesArray))
}
