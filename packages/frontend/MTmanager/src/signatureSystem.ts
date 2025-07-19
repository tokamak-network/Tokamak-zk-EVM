import { Address } from "@ethereumjs/util"

// This is a mock zk-friendly signature system (schnorr).
export class SignatureSystem {
    public sysPubKey: string
    public userPubKeys: Map<Address, string>

    constructor() {
        this.sysPubKey = ''
        this.userPubKeys = new Map()
    }

    public static keyGen(userPubKeys: Map<Address, string>) {
        const signSys =  new SignatureSystem()
        signSys.sysPubKey = 'syspubkey'
        signSys.userPubKeys = userPubKeys
    }
    /**
     * Simulates the verification of a ZK proof.
     * @param proof The ZK proof string.
     * @returns Always returns true in this simulation.
     */
    public verify(publicInput: bigint[], proof: string): boolean {
        console.log(`[Verifier] Verifying proof: ${proof}`)
        if (!this.crs.startsWith('crs')) {
            console.error("[Verifier] CRS format is incorrect.")
            return false
        }
        
        if (!proof.startsWith('dummy-zk-proof-string')) {
            console.error("[Verifier] Proof format is incorrect.")
            return false
        }
        for(const val of publicInput) {
            if (typeof val !== 'bigint') {
                return false
            }
        }
        // In a real system, this would involve complex cryptographic calculations.
        return true;
    }

    public prove(publicInput: bigint[], privateInput: bigint[]): string {
        let proof = 'dummy-zk-proof-string' + this.crs
        for (const val of publicInput) {
            proof += val.toString
        }
        for (const val of privateInput) {
            proof += val.toString
        }
        return proof
    }
}
