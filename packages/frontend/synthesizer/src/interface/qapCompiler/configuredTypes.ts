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
  'Poseidon2x',
  'Poseidon3x',
  'Poseidon4x',
  'Poseidon5x',
  'Poseidon6x',
  // 'PrepareEdDsaScalars',
  'JubjubExpBatch',
  'EdDsaVerify',
  'VerifyMerkleProof',
  'VerifyMerkleProof2x',
  'VerifyMerkleProof3x',
  'VerifyMerkleProof4x',
  'VerifyMerkleProof5x',
  'VerifyMerkleProof6x',
] as const

export type ArithmeticOperator = (typeof ARITHMETIC_OPERATOR_LIST)[number]

type TransactionInputVariable = `TRANSACTION_INPUT${number}`;
type TransactionMessageVariable =
  | 'TRANSACTION_NONCE'
  | 'CONTRACT_ADDRESS'
  | 'FUNCTION_SELECTOR'
  | TransactionInputVariable;

const TRANSACTION_INPUT_VARIABLES: readonly TransactionInputVariable[] = Array.from(
  { length: FUNCTION_INPUT_LENGTH },
  (_, index) => `TRANSACTION_INPUT${index}` as const,
);

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
    'DecToBit',
    'SubExpBatch',
    'Accumulator',
    'Poseidon',
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
  SIGNEXTEND: ['ALU2', 1n << 11n],
  LT: ['ALU1', 1n << 16n],
  GT: ['ALU1', 1n << 17n],
  SLT: ['ALU1', 1n << 18n],
  SGT: ['ALU1', 1n << 19n],
  EQ: ['ALU1', 1n << 20n],
  ISZERO: ['ALU1', 1n << 21n],
  AND: ['ALU1', 1n << 22n],
  OR: ['ALU1', 1n << 23n],
  XOR: ['ALU1', 1n << 24n],
  NOT: ['ALU1', 1n << 25n],
  BYTE: ['ALU2', 1n << 26n],
  SHL: ['ALU2', 1n << 27n],
  SHR: ['ALU2', 1n << 28n],
  SAR: ['ALU2', 1n << 29n],
  DecToBit: ['DecToBit', undefined],
  Accumulator: ['Accumulator', undefined],
  EXP: ['ALU1', 1n << 10n], // Not directly used. SubEXP is used instead.
  Poseidon: ['Poseidon', 1n],
  Poseidon2x: ['Poseidon', 2n],
  Poseidon3x: ['Poseidon', 4n],
  Poseidon4x: ['Poseidon', 8n],
  Poseidon5x: ['Poseidon', 16n],
  Poseidon6x: ['Poseidon', 32n],
  // PrepareEdDsaScalars: ['PrepareEdDsaScalars', undefined],
  EdDsaVerify: ['EdDsaVerify', undefined],
  JubjubExpBatch: ['JubjubExpBatch', undefined],
  VerifyMerkleProof: ['VerifyMerkleProof', 1n],
  VerifyMerkleProof2x: ['VerifyMerkleProof', 2n],
  VerifyMerkleProof3x: ['VerifyMerkleProof', 4n],
  VerifyMerkleProof4x: ['VerifyMerkleProof', 8n],
  VerifyMerkleProof5x: ['VerifyMerkleProof', 16n],
  VerifyMerkleProof6x: ['VerifyMerkleProof', 32n],
} as const;

export const TX_MESSAGE_TO_HASH: readonly TransactionMessageVariable[] = [
  'TRANSACTION_NONCE', 'CONTRACT_ADDRESS', 'FUNCTION_SELECTOR',
  ...TRANSACTION_INPUT_VARIABLES,
];
