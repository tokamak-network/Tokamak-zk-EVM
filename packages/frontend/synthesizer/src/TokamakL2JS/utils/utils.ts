import { addHexPrefix, Address, bigIntToBytes, bytesToBigInt, bytesToHex, concatBytes, hexToBigInt, hexToBytes, setLengthLeft } from "@ethereumjs/util"
import { EdwardsPoint } from "@noble/curves/abstract/edwards"
import { jubjub } from "@noble/curves/misc"
import { poseidon } from "../crypto/index.ts"
import { keccak256 } from "ethereum-cryptography/keccak"



export function batchBigIntTo32BytesEach(...inVals: bigint[]): Uint8Array {
    return concatBytes(...inVals.map(x => setLengthLeft(bigIntToBytes(x), 32)))
}

export function fromEdwardsToAddress(point: EdwardsPoint | Uint8Array): Address {
    const edwardsToAffineBytes = (point: EdwardsPoint): Uint8Array => {
        const affine = point.toAffine()
        return batchBigIntTo32BytesEach(affine.x, affine.y)
    }
    let pointBytes: Uint8Array
    if( point instanceof Uint8Array ) {
        if (point.length === 32) {
            // compressed point
            pointBytes = edwardsToAffineBytes(jubjub.Point.fromBytes(point))
        }
        else if (point.length === 64) {
            // Uncompressed Affine coordinates
            pointBytes = point
        }
        else {
            throw new Error('Invalid EdwardsPoint format')
        }
            
    } else {
        pointBytes = edwardsToAffineBytes(point)
    }
    const addressByte = poseidon(pointBytes).subarray(-20)
    return new Address(addressByte)
}

export function getUserStorageKey(parts: Array<Address | number | bigint | string>, layer: 'L1' | 'TokamakL2'): Uint8Array {
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
    const packed = concatBytes(...bytesArray)
    let hash
    switch (layer) {
        case 'L1': {
            hash = keccak256;
        }
        break;
        case 'TokamakL2': {
            hash = poseidon;
        }
        break;
        default: {
            throw new Error(`Error while making a user's storage key: Undefined layer "${layer}"`)
        }
    }
    return hash(packed)
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


