import type { BufferDirection, LogicalInterface } from './libraryTypes.ts';

export const OPERATOR_LIST = [
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
  'Poseidon',
  'MemoryView',
  'StorageAccess',
  'TransactionSignatureVerify',
  'FrToLimbsPair',
] as const;

export type Operator = (typeof OPERATOR_LIST)[number];

export type TransactionInputVariable = `TRANSACTION_INPUT${number}`;

export const createTransactionInputVariables = (
  numberOfPrivateMessageInputs: number,
): readonly TransactionInputVariable[] => {
  if (!Number.isSafeInteger(numberOfPrivateMessageInputs) || numberOfPrivateMessageInputs < 0) {
    throw new Error('nPrivateMessageInputs must be a non-negative safe integer');
  }
  return Object.freeze(Array.from(
    { length: numberOfPrivateMessageInputs },
    (_, index) => `TRANSACTION_INPUT${index}` as TransactionInputVariable,
  ));
};

export const BUFFER_LIST = [
  // Public output, private input
  'LOG_OUT',
  'STORAGE_STORE',
  'STORAGE_LOAD',
  // Private output, public input
  'TX_IN',
  'BLOCK_IN', // Determined by channel opening
  'EVM_IN', // Determined by contract and function selector
  // Private output, private input
  'PRIVATE_IN',
] as const;

export type ReservedBuffer = (typeof BUFFER_LIST)[number];

export const BUFFER_DESCRIPTION: Record<ReservedBuffer, string> = {
  LOG_OUT: '[Public output & Private input] Buffer to emit committed EVM logs',
  STORAGE_STORE: '[Public output & Private input] Buffer to emit final storage writes',
  STORAGE_LOAD: '[Public output & Private input] Buffer to emit initial storage reads',
  TX_IN: '[Private output & Public input] Buffer to load transaction input',
  BLOCK_IN: '[Private output & Public input] Buffer to load block input',
  EVM_IN:
    '[Private output & Public input] Buffer to load public static input such as ROM, environmental data, or ALU selectors',
  PRIVATE_IN:
    '[Private output & Private input] Buffer to load witness as private, such as initial storage and transaction data',
} as const;

export const COMPOSITION_SUBCIRCUIT_LIST = [
  'ALU3',
  'ALU4A',
  'ALU4B',
  'SHL',
  'ADDMODPrepare',
  'ADDMODVerify',
  'MULMODPrepare',
  'MULMODCandidate',
  'MULMODVerify',
  'AssertZeroWord',
  'SubExp',
  'CheckBus256',
  'Poseidon',
  'MemoryViewStep',
  'StorageAccess',
  'TransactionSignaturePoseidonBatch4',
  'TransactionSignaturePoseidonTail1',
  'TransactionSignaturePoseidonTail2',
  'TransactionSignaturePointPolicy',
  'TransactionSignaturePointPolicyWithHash',
  'TransactionSignatureFixedPrefix70',
  'TransactionSignatureChallengeChunks',
  'TransactionSignatureVariableFirstBatch32',
  'TransactionSignatureVariableBatch32',
  'TransactionSignatureFinal',
  'FrToLimbsPair',
  'ADD',
  'MUL',
  'SUB',
  'NOT',
  'EQ',
  'ISZERO',
  'LT',
  'GT',
  'SLT',
  'SGT',
  'AND',
  'OR',
  'XOR',
  'SHR',
] as const;

export type CompositionSubcircuit = (typeof COMPOSITION_SUBCIRCUIT_LIST)[number];

export const SUBCIRCUIT_LIST = [
  'bufferLogOut',
  'bufferStorageStore',
  'bufferStorageLoad',
  'bufferTxIn',
  'bufferBlockIn',
  'bufferEVMIn',
  'bufferPrvIn',
  ...COMPOSITION_SUBCIRCUIT_LIST,
] as const;

export type SubcircuitNames = (typeof SUBCIRCUIT_LIST)[number];

export type SubcircuitInfoByNameEntry = {
  name: SubcircuitNames;
  id: number;
  NWires: number;
  NRealWires: number;
  inWireIndex: number;
  NInWires: number;
  outWireIndex: number;
  NOutWires: number;
  wiringRange: readonly [start: number, count: number];
  publicRange: readonly [start: number, count: number];
  internalRange: readonly [start: number, count: number];
  logicalInterface?: LogicalInterface;
  bufferDirection?: BufferDirection;
  publicPhase?: string;
};

export type SubcircuitInfoByName = Map<SubcircuitNames, SubcircuitInfoByNameEntry>;
