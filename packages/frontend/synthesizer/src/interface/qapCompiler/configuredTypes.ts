import { FUNCTION_INPUT_LENGTH } from '../tokamakL2js/index.ts';

export const ARITHMETIC_OPERATOR_LIST = [
  'ADD',
  'MUL',
  'SUB',
  'DIV',
  'SDIV',
  'MOD',
  'SMOD',
  'ADDMOD',
  'MULMOD',
  'EXP',
  'LT',
  'GT',
  'SLT',
  'SGT',
  'EQ',
  'ISZERO',
  'AND',
  'OR',
  'XOR',
  'NOT',
  'SHL',
  'SHR',
  'SAR',
  'BYTE',
  'SIGNEXTEND',
  'DecToBit',
  // 'SubEXP',
  'SubExpBatch',
  'Accumulator',
  'Poseidon',
  'Poseidon2xCompress',
  // 'PrepareEdDsaScalars',
  'JubjubExpBatch',
  'EdDsaVerify',
  'VerifyMerkleProof',
  'VerifyMerkleProof2x',
  'VerifyMerkleProof3x',
  'VerifyMerkleProof4x',
] as const

export type ArithmeticOperator = (typeof ARITHMETIC_OPERATOR_LIST)[number]

const TRANSACTION_INPUT_VARIABLES = [
  'TRANSACTION_INPUT0', 'TRANSACTION_INPUT1', 'TRANSACTION_INPUT2', 'TRANSACTION_INPUT3',
  'TRANSACTION_INPUT4', 'TRANSACTION_INPUT5', 'TRANSACTION_INPUT6', 'TRANSACTION_INPUT7',
  'TRANSACTION_INPUT8', 'TRANSACTION_INPUT9', 'TRANSACTION_INPUT10', 'TRANSACTION_INPUT11',
  'TRANSACTION_INPUT12', 'TRANSACTION_INPUT13', 'TRANSACTION_INPUT14', 'TRANSACTION_INPUT15',
  'TRANSACTION_INPUT16', 'TRANSACTION_INPUT17', 'TRANSACTION_INPUT18', 'TRANSACTION_INPUT19',
  'TRANSACTION_INPUT20', 'TRANSACTION_INPUT21', 'TRANSACTION_INPUT22', 'TRANSACTION_INPUT23',
  'TRANSACTION_INPUT24', 'TRANSACTION_INPUT25', 'TRANSACTION_INPUT26', 'TRANSACTION_INPUT27',
  'TRANSACTION_INPUT28',
] as const;

if (TRANSACTION_INPUT_VARIABLES.length !== FUNCTION_INPUT_LENGTH) {
  throw new Error('TRANSACTION_INPUT_VARIABLES length must match FUNCTION_INPUT_LENGTH');
}

export const BUFFER_LIST = [
    // Public output, private input
    'PUBLIC_OUT',
    // Private output, public input
    'PUBLIC_IN',        // Always changing
    'BLOCK_IN',         // Determined by channel opening
    'EVM_IN',        // Determined by contract and function selector
    // Private output, private input
    'PRIVATE_IN',
] as const

export const BUFFER_DESCRIPTION: Record<ReservedBuffer, string> = {
  PUBLIC_OUT: '[Public output & Private input] Buffer to emit user output',
  PUBLIC_IN: '[Private output & Public input] Buffer to load user input',
  BLOCK_IN: '[Private output & Public input] Buffer to load block input',
  EVM_IN: '[Private output & Public input] Buffer to load public static input such as ROM, environmental data, or ALU selectors',
  PRIVATE_IN: '[Private output & Private input] Buffer to load witness as private, such as initial storage, transaction data, and Merkle tree proofs',
} as const

export type ReservedBuffer = (typeof BUFFER_LIST)[number]

export const SUBCIRCUIT_LIST = [
    'bufferPubOut',
    'bufferPubIn',
    'bufferBlockIn',
    'bufferEVMIn',
    'bufferPrvIn',
    'ALU1',
    'ALU2',
    'ALU3',
    'ALU4',
    'ALU5',
    'AND',
    'OR',
    'XOR',
    'DecToBit',
    'SubExpBatch',
    'Accumulator',
    'Poseidon',
    'Poseidon2xCompress',
    // 'PrepareEdDsaScalars',
    'JubjubExpBatch',
    'EdDsaVerify',
    'VerifyMerkleProof',
] as const

export type SubcircuitNames = typeof SUBCIRCUIT_LIST[number]

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

export type SubcircuitInfoByName = Map<
  SubcircuitNames,
  SubcircuitInfoByNameEntry
>;

export const SUBCIRCUIT_ALU_MAPPING: Record<ArithmeticOperator, [SubcircuitNames, bigint | undefined]> = {
  ADD: ['ALU1', 1n << 1n],
  MUL: ['ALU1', 1n << 2n],
  SUB: ['ALU1', 1n << 3n],
  DIV: ['ALU2', 1n << 4n],
  SDIV: ['ALU2', 1n << 5n],
  MOD: ['ALU2', 1n << 6n],
  SMOD: ['ALU2', 1n << 7n],
  ADDMOD: ['ALU2', 1n << 8n],
  MULMOD: ['ALU2', 1n << 9n],
  // SubEXP: ['ALU1', 1n << 10n],
  SubExpBatch: ['SubExpBatch', undefined],
  SIGNEXTEND: ['ALU5', 1n << 11n],
  LT: ['ALU4', 1n << 16n],
  GT: ['ALU4', 1n << 17n],
  SLT: ['ALU4', 1n << 18n],
  SGT: ['ALU4', 1n << 19n],
  EQ: ['ALU1', 1n << 20n],
  ISZERO: ['ALU1', 1n << 21n],
  AND: ['AND', undefined],
  OR: ['OR', undefined],
  XOR: ['XOR', undefined],
  NOT: ['ALU1', 1n << 25n],
  BYTE: ['ALU5', 1n << 26n],
  SHL: ['ALU3', 1n << 27n],
  SHR: ['ALU3', 1n << 28n],
  SAR: ['ALU3', 1n << 29n],
  DecToBit: ['DecToBit', undefined],
  Accumulator: ['Accumulator', undefined],
  EXP: ['ALU1', 1n << 10n], // Not directly used. SubEXP is used instead.
  Poseidon: ['Poseidon', undefined],
  Poseidon2xCompress: ['Poseidon2xCompress', undefined],
  // PrepareEdDsaScalars: ['PrepareEdDsaScalars', undefined],
  EdDsaVerify: ['EdDsaVerify', undefined],
  JubjubExpBatch: ['JubjubExpBatch', undefined],
  VerifyMerkleProof: ['VerifyMerkleProof', 1n],
  VerifyMerkleProof2x: ['VerifyMerkleProof', 2n],
  VerifyMerkleProof3x: ['VerifyMerkleProof', 4n],
  VerifyMerkleProof4x: ['VerifyMerkleProof', 8n],
} as const;

export const TX_MESSAGE_TO_HASH = [
  'TRANSACTION_NONCE', 'CONTRACT_ADDRESS', 'FUNCTION_SELECTOR',
  ...TRANSACTION_INPUT_VARIABLES,
] as const;
