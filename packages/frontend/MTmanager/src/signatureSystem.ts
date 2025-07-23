import { LegacyTx } from "@ethereumjs/tx";
import { Address, bytesToBigInt, createAddressFromString } from "@ethereumjs/util";
import { poseidon2 } from "poseidon-bls12381";

/**
 * A mock class to simulate a digital signature system with a system-wide public key.
 * This dummy implementation includes KeyGen, Sign, and Verify algorithms.
 */
export class SignatureSystem {
    public sysPubKey: string;

    constructor() {
        this.sysPubKey = '';
    }

    /**
     * Generates a system-wide public key.
     * In a real scenario, this would be a complex cryptographic process.
     */
    public keyGen(): void {
        console.log("[SignatureSystem] Generating system-wide public key...");
        this.sysPubKey = 'dummy-system-public-key';
        console.log(`[SignatureSystem] System public key generated: ${this.sysPubKey}`);
    }

    /**
     * Simulates deriving an address from a private key.
     * @param prvKey The private key string.
     * @returns An Ethereum-like Address.
     */
    private getAddress(prvKey: string): Address {
        // This is a dummy address derivation.
        const addressString = '0x' + Buffer.from(prvKey).toString('hex').slice(0, 40).padStart(40, '0')
        return createAddressFromString(addressString)
    }

    /**
     * Signs a transaction using the user's private key and the system's public key.
     * @param transaction The transaction to sign.
     * @param prvKey The private key of the sender.
     * @returns A dummy signature string.
     */
    public sign(transaction: LegacyTx, prvKey: string): string {
        if (!this.sysPubKey) {
            throw new Error("System public key is not generated. Please run keyGen() first.");
        }

        const senderAddress = transaction.getSenderAddress();
        const derivedAddress = this.getAddress(prvKey);

        if (!senderAddress.equals(derivedAddress)) {
            throw new Error("Private key does not correspond to the sender address of the transaction.");
        }

        const txHash = poseidon2([bytesToBigInt(transaction.serialize())])
        const signature = `dummy-signature-for-${txHash}-with-${prvKey}-and-syskey-${this.sysPubKey}`;
        console.log(`[SignatureSystem] Signing transaction with hash ${txHash}`);
        return signature;
    }

    /**
     * Verifies a signature for a given transaction.
     * @param signature The signature to verify.
     * @param transaction The transaction that was signed.
     * @param senderAddress The address of the sender.
     * @returns `true` if the signature is "valid", `false` otherwise.
     */
    public verify(signature: string, transaction: LegacyTx, senderAddress: Address): boolean {
        if (!this.sysPubKey) {
            throw new Error("System public key is not generated. Please run keyGen() first.");
        }

        console.log(`[SignatureSystem] Verifying signature: ${signature}`);
        const txHash = poseidon2([bytesToBigInt(transaction.serialize())])

        // This is a dummy verification.
        // It checks if the signature is in the expected format, including the system public key.
        const expectedPattern = `dummy-signature-for-${txHash}-with-`;
        const expectedSysKeyPart = `-and-syskey-${this.sysPubKey}`;

        if (!signature.startsWith(expectedPattern) || !signature.endsWith(expectedSysKeyPart)) {
            console.error("[SignatureSystem] Signature format is incorrect or does not match the system public key.");
            return false;
        }
        
        // In a real system, we would use the senderAddress to get the user's public key
        // and then use cryptographic functions with the system public key to verify the signature.
        console.log(`[SignatureSystem] Signature for transaction ${txHash} is valid.`);
        return true;
    }
}