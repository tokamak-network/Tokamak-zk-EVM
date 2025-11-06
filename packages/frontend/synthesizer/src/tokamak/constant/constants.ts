import { SubcircuitNames, DataPt, ArithmeticOperator } from '../types/index.js';

export const DEFAULT_SOURCE_SIZE = 32;

export const ACCUMULATOR_INPUT_LIMIT = 32;

export const PUB_IN_PLACEMENT_INDEX = 0;
export const PUB_OUT_PLACEMENT_INDEX = 1;
export const PRV_IN_PLACEMENT_INDEX = 2;
export const PRV_OUT_PLACEMENT_INDEX = 3;
// export const KECCAK_IN_PLACEMENT_INDEX = 4
// export const KECCAK_OUT_PLACEMENT_INDEX = 5
export const INITIAL_PLACEMENT_INDEX = PRV_OUT_PLACEMENT_INDEX + 1;

export const PUB_IN_PLACEMENT = {
  name: 'bufferPubIn' as SubcircuitNames,
  usage: 'Buffer to load public circuit inputs',
  inPts: [] as DataPt[],
  outPts: [] as DataPt[],
};
export const PUB_OUT_PLACEMENT = {
  name: 'bufferPubOut' as SubcircuitNames,
  usage: 'Buffer to emit public circuit outputs',
  inPts: [] as DataPt[],
  outPts: [] as DataPt[],
};
export const PRV_IN_PLACEMENT = {
  name: 'bufferPrvIn' as SubcircuitNames,
  usage: 'Buffer to load private circuit inputs',
  inPts: [] as DataPt[],
  outPts: [] as DataPt[],
};
export const PRV_OUT_PLACEMENT = {
  name: 'bufferPrvOut' as SubcircuitNames,
  usage: 'Buffer to emit private circuit outputs',
  inPts: [] as DataPt[],
  outPts: [] as DataPt[],
};
// export const KECCAK_IN_PLACEMENT = {
//   name: 'bufferPrvInPubOut',
//   usage: 'Buffer to emit external Keccak inputs',
//   inPts: [],
//   outPts: [],
// }
// export const KECCAK_OUT_PLACEMENT = {
//   name: 'bufferPubInPrvOut',
//   usage: 'Buffer to load external Keccak outputs',
//   inPts: [],
//   outPts: [],
// }

export const SUBCIRCUIT_MAPPING = {
  ADD: ['ALU1', 1n << 1n],
  MUL: ['ALU1', 1n << 2n],
  SUB: ['ALU1', 1n << 3n],
  DIV: ['ALU2', 1n << 4n],
  SDIV: ['ALU2', 1n << 5n],
  MOD: ['ALU2', 1n << 6n],
  SMOD: ['ALU2', 1n << 7n],
  ADDMOD: ['ALU2', 1n << 8n],
  MULMOD: ['ALU2', 1n << 9n],
  SubEXP: ['ALU1', 1n << 10n],
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
  EXP: ['ALU1', 1n << 10n],
} as const;
