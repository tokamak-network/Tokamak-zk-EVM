import { addHexPrefix, Address, bigIntToBytes, bytesToBigInt, bytesToHex, concatBytes, hexToBigInt, hexToBytes, setLengthLeft } from "@ethereumjs/util"
import { EdwardsPoint } from "@noble/curves/abstract/edwards"
import { jubjub } from "@noble/curves/misc"
import { poseidon } from "../crypto/index.ts"



export function batchBigIntTo32BytesEach(...inVals: bigint[]): Uint8Array {
    return concatBytes(...inVals.map(x => setLengthLeft(bigIntToBytes(x), 32)))
}

export function fromEdwardsToAddress(point: EdwardsPoint | Uint8Array): Address {
    let pointBytes: Uint8Array
    if( point instanceof Uint8Array ) {
        if (point.length === 64) {
            // Uncompressed Affine coordinates
            const x = bytesToBigInt(point.subarray(0, 32))
            const y = bytesToBigInt(point.subarray(32, 64))
            const edwards = jubjub.Point.fromAffine({x, y})
            pointBytes = edwards.toBytes()
        }
        else if (point.length === 32) {
            // Compressed point
            pointBytes = point
        }
        else {
            throw new Error('Invalid EdwardsPoint format')
        }
            
    } else {
        pointBytes = point.toBytes()
    }
    const addressByte = poseidon(pointBytes).subarray(-20)
    return new Address(addressByte)
}

// export function compressJubJubPoint(point: EdwardsPoint): bigint {
//     return point.X * jubjub.Point.Fp.ORDER + point.Y
// }

// export function recoverJubJubPoint(raw: bigint): EdwardsPoint {
//     const Y = raw % jubjub.Point.Fp.ORDER
//     const X = (raw - Y) / jubjub.Point.Fp.ORDER
//     if (X >= jubjub.Point.Fp.ORDER) {
//         throw new Error('Invalid format for a JubJub point')
//     }
//     return jubjub.Point.fromAffine({x: X, y: Y})
// }


