import { LegacyTx } from "@ethereumjs/tx";
import { Address, bytesToBigInt, createAddressFromBigInt, createAddressFromPrivateKey, createAddressFromPublicKey, createAddressFromString, privateToPublic } from "@ethereumjs/util";
import { poseidon2 } from "poseidon-bls12381";
import { L2Address } from "./types";

/**
 * A mock class to simulate a digital signature system with a system-wide public key.
 * This dummy implementation includes KeyGen, Sign, and Verify algorithms.
 */
export class L2SignatureSystem {
    // This is a dummy address derivation.
    // TODO: Must replace ECDSA and Keccak256 with a zk-friendly signature scheme and Poseidon, respectively.
    public sysPubKey: string;

    constructor(sysPubKey: string) {
        this.sysPubKey = sysPubKey;
    }

    /**
     * Generates a system-wide public key.
     * In a real scenario, this would be a complex cryptographic process.
     */
    public static keyGen(sysPrvKey: string): L2SignatureSystem {
        const sysPubKey = 'dummy-system-public-key from' + sysPrvKey;
        const sign = new L2SignatureSystem(sysPubKey)
        return sign
    }

    /**
     * Simulates deriving an address from a private key.
     * @param prvKey The private key string.
     * @returns An Ethereum-like Address.
     */
    public createAddressFromPublicKey(pubKey: Uint8Array): L2Address {
        // This is a dummy address derivation.
        // TODO: Must replace ECDSA and Keccak256 with a zk-friendly signature scheme and Poseidon, respectively.
        return createAddressFromPublicKey(pubKey)
    }

    public privateToPublic(prvKey: Uint8Array): Uint8Array {
        // This is a dummy public key derivation.
        // TODO: Must replace ECDSA and Keccak256 with a zk-friendly signature scheme and Poseidon, respectively.
        return privateToPublic(prvKey)
    }

    /**
     * Signs a transaction using the user's private key and the system's public key.
     * @param transaction The transaction to sign.
     * @param prvKey The private key of the sender.
     * @returns A dummy signature string.
     */
    public sign(transaction: LegacyTx, prvKey: Uint8Array): LegacyTx {
        // This is a dummy public key derivation.
        // TODO: Must replace ECDSA and Keccak256 with a zk-friendly signature scheme and Poseidon, respectively.
        return transaction.sign(prvKey)
    }

    /**
     * Verifies a signature for a given transaction.
     * @param signature The signature to verify.
     * @param transaction The transaction that was signed.
     * @param senderAddress The address of the sender.
     * @returns `true` if the signature is "valid", `false` otherwise.
     */
    public verify(transaction: LegacyTx): boolean {
        return transaction.verifySignature()
    }
}