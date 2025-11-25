import { Address, bigIntToBytes, bytesToBigInt, setLengthLeft, bigIntToUnpaddedBytes, unpadBytes, concatBytes, equalsBytes, bytesToHex } from "@ethereumjs/util"
import { LegacyTx, TransactionInterface, TransactionType, createLegacyTx } from '@ethereumjs/tx'
import { EthereumJSErrorWithoutCode } from "@ethereumjs/rlp"
import { jubjub } from "@noble/curves/misc"
import { EdwardsPoint } from "@noble/curves/abstract/edwards"
import { eddsaSign_unsafe, eddsaVerify, getEddsaPublicKey, poseidon } from "../crypto/index.ts"
import { batchBigIntTo32BytesEach, fromEdwardsToAddress } from "../utils/index.ts"
import { createTokamakL2Tx } from "./constructors.ts"

// LegacyTx prohibits to add new members for extension. Bypassing this problem by the follow:
const _unsafeSenderPubKeyStorage = new WeakMap<TokamakL2Tx, Uint8Array>();

export class TokamakL2Tx extends LegacyTx implements TransactionInterface<typeof TransactionType.Legacy> {
    declare readonly to: Address
    // v: public key in bytes form
    // r: randomizer in bytes form
    // s: The EDDSA signature (in JUBJUB scalar field)
    
    initUnsafeSenderPubKey(key: Uint8Array): void {
        if (_unsafeSenderPubKeyStorage.has(this)) {
        throw new Error('Overwriting the sender public key (unsafe) is not allowed');
        }
        _unsafeSenderPubKeyStorage.set(this, key);
    }
    get senderPubKeyUnsafe(): Uint8Array {
        const v = _unsafeSenderPubKeyStorage.get(this);
        if (!v) throw new Error('The sender public key (unsafe) is not initialized');
        return v;
    }

    getFunctionSelector(): Uint8Array {
        if (this.data.length < 4) {
            throw new Error('Insufficient transaction data')
        }
        return this.data.slice(0, 4)
    }
    
    getFunctionInput(index: number): Uint8Array {
        const offset = 4 + 32 * index
        const endExclusiveIndex = offset + 32
        if (this.data.length < endExclusiveIndex) {
            // throw new Error('Insufficient transaction data')
            return new Uint8Array()
        }
        return this.data.slice(offset, endExclusiveIndex)
    }

    getUnsafeEddsaRandomizer(): EdwardsPoint | undefined {
        return this.r === undefined ? undefined : jubjub.Point.fromBytes(bigIntToBytes(this.r))
    }

    getUnsafeEddsaPubKey(): EdwardsPoint {
        return jubjub.Point.fromBytes(this.senderPubKeyUnsafe)
    }

    override isSigned(): boolean {
        const { v, r, s } = this
        if (v === undefined || r === undefined || s === undefined) {
            return false
        }
        return true
    }
    
    override getMessageToSign(): Uint8Array[] {
        const messageRaw: Uint8Array[] = [
            bigIntToUnpaddedBytes(this.nonce),
            this.to.bytes,
            this.getFunctionSelector(),
        ]
        for (let inputIndex = 0; inputIndex < 9; inputIndex++) {
            messageRaw.push(this.getFunctionInput(inputIndex))
        }
        return messageRaw.map(m => setLengthLeft(m, 32))
    }

    override getSenderPublicKey(): Uint8Array {
        if (!this.isSigned()) {
            throw new Error('Public key can be recovered only from a signed transaction')
        }
        const recovered = getEddsaPublicKey(
            concatBytes(...this.getMessageToSign(), setLengthLeft(this.senderPubKeyUnsafe, 32)),
            this.v!, 
            bigIntToBytes(this.r!), 
            bigIntToBytes(this.s!)
        )
        if (!equalsBytes(this.senderPubKeyUnsafe, recovered)) {
            throw new Error('Recovered sender public key is different from the initialized one')
        }
        return recovered
    }

    override addSignature(
        v: bigint,
        r: Uint8Array | bigint,
        s: Uint8Array | bigint,
        // convertV is `true` when called from `sign`
        // This is used to convert the `v` output from `ecsign` (0 or 1) to the values used for legacy txs:
        // 27 or 28 for non-EIP-155 protected txs
        // 35 or 36 + chainId * 2 for EIP-155 protected txs
        // See: https://eips.ethereum.org/EIPS/eip-155
        convertV: boolean = false,
    ): TokamakL2Tx {
        if (convertV) {
            throw new Error('convertV should be false')
        }
        const rBigint = typeof r === 'bigint' ? r : bytesToBigInt(r)
        const sBigint = typeof s === 'bigint' ? s : bytesToBigInt(s)

        const opts = { ...this.txOptions, common: this.common }

        return createTokamakL2Tx(
            {
                nonce: this.nonce,
                to: this.to,
                data: this.data,
                senderPubKey: this.senderPubKeyUnsafe,
                v: 27n,
                r: rBigint,
                s: sBigint,
            },
            opts,
        )
    }

    override verifySignature(): boolean {
        try {
            // Main signature verification is done in `getSenderPublicKey()`
            const publicKey = this.getSenderPublicKey()
            return unpadBytes(publicKey).length !== 0
        } catch {
            return false
        }
    }

    override getSenderAddress(): Address {
        const pubKeyByte = this.getSenderPublicKey()
        const recovered = fromEdwardsToAddress(pubKeyByte)
        return recovered
    }

    override sign(privateKey: Uint8Array, extraEntropy: Uint8Array | boolean = false): TokamakL2Tx {
        const sk = bytesToBigInt(privateKey)
        if (sk < 0n || sk >= jubjub.Point.Fn.ORDER) {
            throw new Error('EDDSA private key must be in JubJub scalar field')
        }
        const msg = this.getMessageToSign()
        const signOnce = (nonce: bigint) => eddsaSign_unsafe(sk, msg, bigIntToBytes(nonce))

        let sig: {randomizer: EdwardsPoint, signature: bigint}

        if (extraEntropy === true) {
            // keep bumping nonce until R ≠ 0
            let nonce = 0n
            do { sig = signOnce(nonce++) } while (sig.randomizer.equals(jubjub.Point.ZERO))
        } else if (extraEntropy === false || extraEntropy === undefined) {
            sig = signOnce(this.nonce)
        } else {
            // extraEntropy is Uint8Array
            sig = signOnce(bytesToBigInt(extraEntropy))
        }

        const publicKey = jubjub.Point.BASE.multiply(sk)
        if (!publicKey.equals(jubjub.Point.fromBytes(this.senderPubKeyUnsafe))) {
            throw new Error("The public key initialized is not derived from the input private key")
        }
        if (!eddsaVerify(msg, publicKey, sig.randomizer, sig.signature)) {
            throw new Error('Tried to sign but verification failure')
        }

        return this.addSignature(
            27n,
            bytesToBigInt(sig.randomizer.toBytes()),
            sig.signature
        )
    }
}