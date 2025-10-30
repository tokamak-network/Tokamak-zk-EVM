import { jubjub } from "@noble/curves/misc";
import { DST_NONCE, poseidon_raw } from "../../params/index.ts";
import { bigIntToBytes, bytesToBigInt, concatBytes, setLengthLeft } from "@ethereumjs/util";
import { EdwardsPoint } from "@noble/curves/abstract/edwards";
import { batchBigIntTo32BytesEach } from "../utils/index.ts";
import { POSEIDON_INPUTS } from "src/tokamak/interface/qapCompiler/importedConstants.ts";

// To replace KECCAK256 with poseidon4. Example: 
// const common = new Common({ chain: Mainnet, customCrypto: { keccak256: poseidon } })
// const block = createBlock({}, { common })
export function poseidon(msg: Uint8Array): Uint8Array {
    const checkBLS12Modulus = (w: bigint) => {
        if (w < 0n || w >= jubjub.Point.Fp.ORDER) {
            throw new Error('Input word was expected to be in the BLS12-381 scalar field, but it is not.');
        }
    }
    // Ensure arity matches the concrete Poseidon4 we call
    if (POSEIDON_INPUTS !== 4) {
        throw new Error(`POSEIDON_INPUTS=${POSEIDON_INPUTS} not supported: expected 4 for poseidon4()`);
    }

    // if (msg.byteLength % 32 !== 0) {
    //     // throw new Error('Input message length must be a multiple of 32 bytes')
    // }

    // Split input bytes into 32-byte big-endian words → BigInt[] (no Node Buffer dependency)
    const words: bigint[] = Array.from({ length: Math.ceil(msg.byteLength / 32) }, (_, i) => {
      const slice = msg.subarray(i * 32, (i + 1) * 32)
      return bytesToBigInt(slice)
    });

    // Fold in chunks of POSEIDON_INPUTS; zero-pad tail; **strict field check** (no modular reduction)
    const foldOnce = (arr: bigint[]): bigint[] => {
        const total = Math.ceil(arr.length / POSEIDON_INPUTS) * POSEIDON_INPUTS;
        const out: bigint[] = [];
        for (let i = 0; i < total; i += POSEIDON_INPUTS) {
            const chunk = Array.from({ length: POSEIDON_INPUTS }, (_, k) => arr[i + k] ?? 0n);
            // Every word must be within the field [0, MOD)
            // chunk.map(checkBLS12Modulus)
            out.push(poseidon_raw(chunk as [bigint, bigint, bigint, bigint]));
        }
        return out;
    };

    let acc: bigint[]
    if (words.length > 0) {
        // Repeatedly fold until a single word remains
        acc = foldOnce(words);
        while (acc.length > 1) acc = foldOnce(acc);
    } else {
        acc = [poseidon_raw([0n, 0n, 0n, 0n])]
    }

    // Return big-endian bytes of the field element; caller decides fixed-length padding if needed
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

export function eddsaSign_unsafe(prvKey: bigint, msg: Uint8Array[], nonce?: Uint8Array): {randomizer: EdwardsPoint, signature: bigint} {
    const nonceKeyBytes = poseidon(concatBytes(DST_NONCE, setLengthLeft(bigIntToBytes(prvKey), 32), nonce === undefined ? new Uint8Array([]) : setLengthLeft(nonce, 32)))
    const pubKey = jubjub.Point.BASE.multiply(prvKey)
    
    const r = bytesToBigInt(poseidon(concatBytes(
        DST_NONCE,
        nonceKeyBytes,
        batchBigIntTo32BytesEach(
            pubKey.toAffine().x, 
            pubKey.toAffine().y
        ),
        ...msg,
    ))) % jubjub.Point.Fn.ORDER

    const R = jubjub.Point.BASE.multiply(r)

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

    const s = (r + ep * prvKey) % jubjub.Point.Fn.ORDER
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
