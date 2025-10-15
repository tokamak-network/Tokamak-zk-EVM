import { Address, bigIntToBytes, bytesToBigInt, setLengthLeft, bigIntToUnpaddedBytes, unpadBytes } from "@ethereumjs/util"
import { LegacyTx, createLegacyTx } from '@ethereumjs/tx'
import { EthereumJSErrorWithoutCode } from "@ethereumjs/rlp"
import { jubjub } from "@noble/curves/misc"
import { EdwardsPoint } from "@noble/curves/abstract/edwards"
import { eddsaSign_unsafe, eddsaVerify, poseidon } from "../crypto/index.ts"
import { batchBigIntTo32BytesEach, compressJubJubPoint, extractFunctionInput, extractFunctionSelector, recoverJubJubPoint } from "../utils/index.ts"


export class TokamakL2Tx extends LegacyTx {
    public readonly to!: Address
    // v: v = X * JUBJUBBaseFieldModulo + Y, for the X and Y coordinates of public key
    // r: r = X * JUBJUBBaseFieldModulo + Y, for the X and Y coordinates of a randomizer for an EDDSA signature
    // s: The EDDSA signature (in JUBJUB scalar field)

    isSigned(): boolean {
        const { v, r, s } = this
        if (v === undefined || r === undefined || s === undefined) {
            return false
        }
        return true
    }
    
    getMessageToSign(): Uint8Array[] {
    const messageRaw: Uint8Array[] = [
      bigIntToUnpaddedBytes(this.nonce),
      this.to.bytes,
      extractFunctionSelector(this.data),
    ]
        for (let inputIndex = 0; inputIndex < 9; inputIndex++) {
            messageRaw.push(extractFunctionInput(this.data, inputIndex))
        }
    return messageRaw.map(m => setLengthLeft(m, 32))
    }

    getSenderPublicKey(): Uint8Array {
        if (!this.isSigned()) {
            throw new Error('Public key can be recovered only from a signed transaction')
        }
        
        const pubKey = recoverJubJubPoint(this.v!)
        const randomizer = recoverJubJubPoint(this.r!)
        if (!eddsaVerify(this.getMessageToSign(), pubKey, randomizer, this.s!)) {
            throw new Error('Signature verification failed')
        }
        return batchBigIntTo32BytesEach(pubKey.X, pubKey.Y)
    }

    addSignature(
        v: bigint,
        r: Uint8Array | bigint,
        s: Uint8Array | bigint,
        // convertV is `true` when called from `sign`
        // This is used to convert the `v` output from `ecsign` (0 or 1) to the values used for legacy txs:
        // 27 or 28 for non-EIP-155 protected txs
        // 35 or 36 + chainId * 2 for EIP-155 protected txs
        // See: https://eips.ethereum.org/EIPS/eip-155
        convertV: boolean = false,
    ): LegacyTx {
        if (convertV) {
            throw new Error('convertV should be false')
        }
        const rBigint = typeof r === 'bigint' ? r : bytesToBigInt(r)
        const sBigint = typeof s === 'bigint' ? s : bytesToBigInt(s)

        const opts = { ...this.txOptions, common: this.common }

        return createLegacyTx(
        {
            nonce: this.nonce,
            gasPrice: this.gasPrice,
            gasLimit: this.gasLimit,
            to: this.to,
            value: this.value,
            data: this.data,
            v,
            r: rBigint,
            s: sBigint,
        },
        opts,
        )
    }

    verifySignature(): boolean {
    try {
        // Main signature verification is done in `getSenderPublicKey()`
        const publicKey = this.getSenderPublicKey()
        return unpadBytes(publicKey).length !== 0
    } catch {
        return false
    }
    }

    getSenderAddress(): Address {
        const pubKeyByte = this.getSenderPublicKey()
        if (pubKeyByte.length !== 64) {
            throw EthereumJSErrorWithoutCode('Expected pubKey to be of length 64')
        }
        // Only take the lower 160bits of the hash
        const addressByte = poseidon(pubKeyByte).subarray(-20)
        return new Address(addressByte)
    }

    sign(privateKey: Uint8Array, extraEntropy: Uint8Array | boolean = false): LegacyTx {
        const sk = bytesToBigInt(privateKey)
        if (sk < 0n || sk >= jubjub.Point.Fn.ORDER) {
            throw new Error('EDDSA private key must be in JubJub scalar field')
        }
        const msg = this.getMessageToSign()
        const signOnce = (nonce: bigint = 0n) => eddsaSign_unsafe(sk, msg, bigIntToBytes(nonce))

        let sig: {randomizer: EdwardsPoint, signature: bigint}

        if (extraEntropy === true) {
            // keep bumping nonce until R ≠ 0
            let nonce = 0n
            do { sig = signOnce(nonce++) } while (sig.randomizer.equals(jubjub.Point.ZERO))
        } else if (extraEntropy === false || extraEntropy === undefined) {
            sig = signOnce()
        } else {
            // extraEntropy is Uint8Array
            sig = signOnce(bytesToBigInt(extraEntropy))
        }

        const publicKey = jubjub.Point.BASE.multiply(sk)
        if (!eddsaVerify(msg, publicKey, sig.randomizer, sig.signature)) {
            throw new Error('Tried to sign but verification failure')
        }

        return this.addSignature(
            compressJubJubPoint(publicKey),
            compressJubJubPoint(sig.randomizer),
            sig.signature
        )
    }
}