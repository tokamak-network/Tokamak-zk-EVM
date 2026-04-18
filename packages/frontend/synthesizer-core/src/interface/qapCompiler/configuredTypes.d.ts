export declare const ARITHMETIC_OPERATOR_LIST: readonly ["ADD", "MUL", "SUB", "DIV", "SDIV", "MOD", "SMOD", "ADDMOD", "MULMOD", "EXP", "LT", "GT", "SLT", "SGT", "EQ", "ISZERO", "AND", "OR", "XOR", "NOT", "SHL", "SHR", "SAR", "BYTE", "SIGNEXTEND", "DecToBit", "SubExpBatch", "Accumulator", "Poseidon", "Poseidon2x", "Poseidon3x", "Poseidon4x", "Poseidon5x", "Poseidon6x", "JubjubExpBatch", "EdDsaVerify", "VerifyMerkleProof", "VerifyMerkleProof2x", "VerifyMerkleProof3x", "VerifyMerkleProof4x", "VerifyMerkleProof5x", "VerifyMerkleProof6x"];
export type ArithmeticOperator = (typeof ARITHMETIC_OPERATOR_LIST)[number];
export declare const BUFFER_LIST: readonly ["PUBLIC_OUT", "PUBLIC_IN", "BLOCK_IN", "EVM_IN", "PRIVATE_IN"];
export declare const BUFFER_DESCRIPTION: Record<ReservedBuffer, string>;
export type ReservedBuffer = (typeof BUFFER_LIST)[number];
export declare const SUBCIRCUIT_LIST: readonly ["bufferPubOut", "bufferPubIn", "bufferBlockIn", "bufferEVMIn", "bufferPrvIn", "ALU1", "ALU2", "DecToBit", "SubExpBatch", "Accumulator", "Poseidon", "JubjubExpBatch", "EdDsaVerify", "VerifyMerkleProof"];
export type SubcircuitNames = typeof SUBCIRCUIT_LIST[number];
export type SubcircuitInfoByNameEntry = {
    name: SubcircuitNames;
    id: number;
    NWires: number;
    inWireIndex: number;
    NInWires: number;
    outWireIndex: number;
    NOutWires: number;
    flattenMap: number[];
};
export type SubcircuitInfoByName = Map<SubcircuitNames, SubcircuitInfoByNameEntry>;
export declare const SUBCIRCUIT_ALU_MAPPING: Record<ArithmeticOperator, [SubcircuitNames, bigint | undefined]>;
export declare const TX_MESSAGE_TO_HASH: readonly ["TRANSACTION_NONCE", "CONTRACT_ADDRESS", "FUNCTION_SELECTOR", "TRANSACTION_INPUT0", "TRANSACTION_INPUT1", "TRANSACTION_INPUT2", "TRANSACTION_INPUT3", "TRANSACTION_INPUT4", "TRANSACTION_INPUT5", "TRANSACTION_INPUT6", "TRANSACTION_INPUT7", "TRANSACTION_INPUT8", "TRANSACTION_INPUT9", "TRANSACTION_INPUT10", "TRANSACTION_INPUT11", "TRANSACTION_INPUT12", "TRANSACTION_INPUT13", "TRANSACTION_INPUT14", "TRANSACTION_INPUT15", "TRANSACTION_INPUT16", "TRANSACTION_INPUT17", "TRANSACTION_INPUT18", "TRANSACTION_INPUT19", "TRANSACTION_INPUT20", "TRANSACTION_INPUT21", "TRANSACTION_INPUT22", "TRANSACTION_INPUT23", "TRANSACTION_INPUT24", "TRANSACTION_INPUT25", "TRANSACTION_INPUT26", "TRANSACTION_INPUT27", "TRANSACTION_INPUT28"];
//# sourceMappingURL=configuredTypes.d.ts.map