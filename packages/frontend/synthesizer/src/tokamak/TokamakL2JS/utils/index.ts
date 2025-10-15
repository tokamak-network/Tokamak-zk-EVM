import { bigIntToBytes, concatBytes, setLengthLeft } from "@ethereumjs/util"
import { EdwardsPoint } from "@noble/curves/abstract/edwards"
import { jubjub } from "@noble/curves/misc"



export function batchBigIntTo32BytesEach(...inVals: bigint[]): Uint8Array {
    return concatBytes(...inVals.map(x => setLengthLeft(bigIntToBytes(x), 32)))
}

export function recoverJubJubPoint(raw: bigint): EdwardsPoint {
    const Y = raw % jubjub.Point.Fp.ORDER
    const X = (raw - Y) / jubjub.Point.Fp.ORDER
    if (X >= jubjub.Point.Fp.ORDER) {
        throw new Error('Invalid format for a JubJub point')
    }
    return jubjub.Point.fromAffine({x: X, y: Y})
}

export function compressJubJubPoint(point: EdwardsPoint): bigint {
    return point.X * jubjub.Point.Fp.ORDER + point.Y
}

export function extractFunctionSelector(data: Uint8Array): Uint8Array {
    if (data.length < 4) {
        throw new Error('Insufficient transaction data')
    }
    return data.slice(0, 4)
}

export function extractFunctionInput(data: Uint8Array, index: number): Uint8Array {
    const offset = 4 + 32 * index
    const endExclusiveIndex = offset + 32
    if (data.length < endExclusiveIndex) {
        throw new Error('Insufficient transaction data')
    }
    return data.slice(offset, endExclusiveIndex)
}