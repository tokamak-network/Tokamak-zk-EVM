/**
 * Utility class for handling Synthesizer arithmetic operations
 */
export declare class ArithmeticOperations {
    private static _config;
    private static readonly MAX_UINT256;
    private static readonly SIGN_BIT;
    private static readonly N;
    private static readonly BLS12381MODULUS;
    private static readonly JUBJUBMODULUS;
    static configure(config: {
        arithExpBatchSize: number;
        jubjubExpBatchSize: number;
    }): void;
    private static _requireBatchSize;
    /**
     * Basic arithmetic operations
     */
    static add(ins: bigint[]): bigint;
    static mul(ins: bigint[]): bigint;
    static sub(ins: bigint[]): bigint;
    static div(ins: bigint[]): bigint;
    static sdiv(ins: bigint[]): bigint;
    /**
     * Modulo operations
     */
    static mod(ins: bigint[]): bigint;
    static smod(ins: bigint[]): bigint;
    static addmod(ins: bigint[]): bigint;
    static mulmod(ins: bigint[]): bigint;
    /**
     * Comparison operations
     */
    static lt(ins: bigint[]): bigint;
    static gt(ins: bigint[]): bigint;
    static slt(ins: bigint[]): bigint;
    static sgt(ins: bigint[]): bigint;
    static eq(ins: bigint[]): bigint;
    static iszero(ins: bigint[]): bigint;
    /**
     * Bit operations
     */
    static and(ins: bigint[]): bigint;
    static or(ins: bigint[]): bigint;
    static xor(ins: bigint[]): bigint;
    static not(ins: bigint[]): bigint;
    /**
     * Shift operations
     */
    static shl(ins: bigint[]): bigint;
    static shr(ins: bigint[]): bigint;
    static sar(ins: bigint[]): bigint;
    /**
     * Byte operations
     */
    static byte(ins: bigint[]): bigint;
    /**
     * Sign extension
     */
    static signextend(ins: bigint[]): bigint;
    /**
     * Decimal to Bit
     */
    static decToBit(ins: bigint[]): bigint[];
    /**
     * SubExpBatch
     */
    static subExpBatch(in_vals: bigint[]): bigint[];
    /**
     * Accumulator
     */
    static accumulator(in_vals: bigint[]): bigint;
    /**
     * PoseidonN
     */
    static poseidonN(in_vals: bigint[]): bigint;
    /**
     * PoseidonChainCompress
     */
    static poseidonChainCompress(in_vals: bigint[]): bigint;
    private static _bls12381Arith;
    /**
     * JubjubAdd
     */
    private static _jubjubAdd;
    /**
     * JubjubExpBatch
     */
    static jubjubExpBatch(in_vals: bigint[]): bigint[];
    /**
     * EdDsaVerify
     */
    static edDsaVerify(in_vals: bigint[]): bigint[];
    /**
     * VerifyMerkleProof
     */
    static verifyMerkleProof(inVals: bigint[]): bigint[];
    /**
     * VerifyMerkleProof2x
     */
    static verifyMerkleProof2x(inVals: bigint[]): bigint[];
    /**
     * VerifyMerkleProof3x
     */
    static verifyMerkleProof3x(inVals: bigint[]): bigint[];
    /**
     * VerifyMerkleProof4x
     */
    static verifyMerkleProof4x(inVals: bigint[]): bigint[];
    /**
     * VerifyMerkleProof5x
     */
    static verifyMerkleProof5x(inVals: bigint[]): bigint[];
    /**
     * VerifyMerkleProof6x
     */
    static verifyMerkleProof6x(inVals: bigint[]): bigint[];
    private static verifyMerkleProofNx;
}
//# sourceMappingURL=arithmeticOperations.d.ts.map