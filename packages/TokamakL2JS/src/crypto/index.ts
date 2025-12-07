import { jubjub } from "@noble/curves/misc";
import { bigIntToBytes, bytesToBigInt, concatBytes, setLengthLeft } from "@ethereumjs/util";
import { EdwardsPoint } from "@noble/curves/abstract/edwards";
import {
  poseidon2,
  poseidon3,
  poseidon4,
  poseidon5,
  poseidon6,
  poseidon7,
  poseidon8,
  poseidon9,
  poseidon10,
  poseidon11,
  poseidon12,
  poseidon13,
  poseidon14,
  poseidon15,
  poseidon16,
} from "poseidon-bls12381"
import { POSEIDON_INPUTS } from '@tokamak-zk-evm/qap-compiler'
import { DST_NONCE } from "../channelConfig/constants.ts";
import { batchBigIntTo32BytesEach } from "../utils/index.ts";

export const poseidon_raw = (inVals: bigint[]): bigint => {
    if (inVals.length !== POSEIDON_INPUTS) {
    throw new Error(`Expected an array with ${POSEIDON_INPUTS} elements, but got ${inVals.length} elements`)
    }

    const poseidonByArity: Record<number, (inputs: bigint[]) => bigint> = {
    2: poseidon2,
    3: poseidon3,
    4: poseidon4,
    5: poseidon5,
    6: poseidon6,
    7: poseidon7,
    8: poseidon8,
    9: poseidon9,
    10: poseidon10,
    11: poseidon11,
    12: poseidon12,
    13: poseidon13,
    14: poseidon14,
    15: poseidon15,
    16: poseidon16,
    }

    const fn = poseidonByArity[POSEIDON_INPUTS]
    if (!fn) {
    throw new Error(`Unsupported POSEIDON_INPUTS=${POSEIDON_INPUTS}; no matching poseidon{arity} function`)
    }

    return fn(inVals)
}

export function poseidon_raw2xCompress(in_vals: bigint[]): bigint {
    if (in_vals.length !== POSEIDON_INPUTS ** 2) {
        throw new Error(`poseidon${POSEIDON_INPUTS} expected exactly ${POSEIDON_INPUTS} values`)
    }

    const interim: bigint[] = []
    for (var k = 0; k < POSEIDON_INPUTS; k++) {
        const children = in_vals.slice(k * POSEIDON_INPUTS, (k + 1) * POSEIDON_INPUTS)
        interim.push(poseidon_raw(children))
    }
    return poseidon_raw(interim)
}

// To replace KECCAK256 with poseidon4. Example:
// const common = new Common({ chain: Mainnet, customCrypto: { keccak256: poseidon } })
// const block = createBlock({}, { common })
export function poseidon(msg: Uint8Array): Uint8Array {
    if (msg.length === 0 ) {
        return setLengthLeft(bigIntToBytes(poseidon_raw(Array<bigint>(POSEIDON_INPUTS).fill(0n))), 32)
    }
    // Split input bytes into 32-byte big-endian words → BigInt[] (no Node Buffer dependency)
    const words: bigint[] = Array.from({ length: Math.ceil(msg.byteLength / 32) }, (_, i) => {
      const slice = msg.subarray(i * 32, (i + 1) * 32)
      return bytesToBigInt(slice)
    });

    const fold = (arr: bigint[]): bigint[] => {
        const n1xChunks = Math.ceil(arr.length / POSEIDON_INPUTS);
        const nPaddedChildren = n1xChunks * POSEIDON_INPUTS;

        const mode2x: boolean = nPaddedChildren % (POSEIDON_INPUTS ** 2) === 0

        let placeFunction = mode2x ?
            poseidon_raw2xCompress :
            poseidon_raw

        const nChildren = mode2x ? (POSEIDON_INPUTS ** 2) : POSEIDON_INPUTS

        const out: bigint[] = [];
        for (let childId = 0; childId < nPaddedChildren; childId += nChildren) {
            const chunk = Array.from({ length: nChildren }, (_, localChildId) => arr[childId + localChildId] ?? 0n);
            // Every word must be within the field [0, MOD)
            // chunk.map(checkBLS12Modulus)
            out.push(placeFunction(chunk));
        }
        return out;
    };

    // Repeatedly fold until a single word remains
    let acc: bigint[] = fold(words)
    while (acc.length > 1) acc = fold(acc)
    return setLengthLeft(bigIntToBytes(acc[0]), 32);
}

// To replace ecrecover with Eddsa public key recovery. Example:
// const common = new Common({ chain: Mainnet, customCrypto: { ecrecover: getEddsaPublicKey } })
// const block = createBlock({}, { common })
export function getEddsaPublicKey(
    msgHash: Uint8Array,
    v: bigint,
    r: Uint8Array,
    s: Uint8Array,
    chainId?: bigint,
): Uint8Array {
    // msgHash must be the original message, not a hash.
    // The last 32 bytes of the msgHash contains the public key
    // v is useless but only to satisfy the interface of LegacyTx
    if (chainId !== undefined) {
        throw new Error("Eddsa does not require 'chainId' to recover a public key")
    }
    const msg = msgHash.subarray(0, msgHash.byteLength - 32)
    const pubKeyBytes = msgHash.subarray(msgHash.byteLength - 32, )

    const pubKey = jubjub.Point.fromBytes(pubKeyBytes)
    const randomizer = jubjub.Point.fromBytes(r)
    if (!eddsaVerify([msg], pubKey, randomizer, bytesToBigInt(s))) {
        throw new Error('Signature verification failed')
    }
    return pubKeyBytes
}

export function eddsaSign(prvKey: bigint, msg: Uint8Array[], txNonce: Uint8Array): {randomizer: EdwardsPoint, signature: bigint} {
    const pubKey = jubjub.Point.BASE.multiply(prvKey)

    let nonce: Uint8Array = txNonce
    let s: bigint = 0n
    let R: EdwardsPoint = jubjub.Point.ZERO
    while (R.equals(jubjub.Point.ZERO) || s === 0n) {
        const nonceKeyBytes = poseidon(concatBytes(
            DST_NONCE,
            setLengthLeft(bigIntToBytes(prvKey), 32),
            setLengthLeft(nonce, 32),
        ))

        const r = bytesToBigInt(poseidon(concatBytes(
            DST_NONCE,
            nonceKeyBytes,
            batchBigIntTo32BytesEach(
                pubKey.toAffine().x,
                pubKey.toAffine().y
            ),
            ...msg,
        ))) % jubjub.Point.Fn.ORDER

        R = jubjub.Point.BASE.multiply(r)

        const e = bytesToBigInt(poseidon(concatBytes(
            batchBigIntTo32BytesEach(
                R.toAffine().x,
                R.toAffine().y,
                pubKey.toAffine().x,
                pubKey.toAffine().y
            ),
            ...msg
        )))
        const ep = e % jubjub.Point.Fn.ORDER

        s = (r + ep * prvKey) % jubjub.Point.Fn.ORDER

        nonce = nonceKeyBytes
    }


    return {
        signature: s,
        randomizer: R,
    }
}

export function eddsaVerify(msg: Uint8Array[], pubKey: EdwardsPoint, randomizer: EdwardsPoint, signature: bigint): boolean {
    if (signature >= jubjub.Point.Fn.ORDER || signature < 0n) return false
    if (pubKey.equals(jubjub.Point.ZERO)) return false
    if (randomizer.equals(jubjub.Point.ZERO)) return false
    if (msg.length === 0) return false
    const e = bytesToBigInt(poseidon(concatBytes(
        batchBigIntTo32BytesEach(
            randomizer.toAffine().x,
            randomizer.toAffine().y,
            pubKey.toAffine().x,
            pubKey.toAffine().y
        ),
        ...msg
    ))) % jubjub.Point.Fn.ORDER
    const LHS = jubjub.Point.BASE.multiply(signature)
    const RHS = pubKey.multiply(e).add(randomizer)
    return LHS.equals(RHS)
}
