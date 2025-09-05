import { ArithmeticOperator } from "./arithmetic.ts";

// Wire mapping types for better type safety
export type GlobalWireEntry = [subcircuitId: number, localWireIndex: number];
export type GlobalWireList = GlobalWireEntry[];

export type SubcircuitNames =
  // Alphabet order
  | 'Accumulator'
  | 'ALU1'
  | 'ALU2'
  | 'ALU3'
  | 'ALU4'
  | 'ALU5'
  | 'AND'
  | 'bufferPubIn'
  | 'bufferStateIn'
  | 'bufferStateOut'
  | 'bufferStaticIn'
  | 'bufferTransactionIn'
  | 'DecToBit'
  | 'EdDsaVerify'
  | 'JubjubExp36'
  | 'OR'
  | 'Poseidon4'
  | 'PrepareEdDsaScalars'
  | 'XOR'

export type SubcircuitInfoByNameEntry = {
  id: number;
  NWires: number;
  inWireIndex: number;
  NInWires: number;
  outWireIndex: number;
  NOutWires: number;
  flattenMap?: number[];
};

// Extended version with required flattenMap for runtime use
export type SubcircuitInfoWithFlattenMap = Omit<
  SubcircuitInfoByNameEntry,
  'flattenMap'
> & {
  flattenMap: number[];
};

export type SubcircuitInfoByName = Map<
  SubcircuitNames,
  SubcircuitInfoByNameEntry
>;

// Type guard to check if subcircuit has flattenMap
export function hasValidFlattenMap(
  subcircuit: SubcircuitInfoByNameEntry,
): subcircuit is SubcircuitInfoWithFlattenMap {
  return (
    Array.isArray(subcircuit.flattenMap) && subcircuit.flattenMap.length > 0
  );
}

export const SUBCIRCUIT_MAPPING: Record<ArithmeticOperator, [SubcircuitNames, bigint | undefined]> = {
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
  EXP: ['ALU1', 1n << 10n], // Not directly used
  Poseidon4: ['Poseidon4', undefined],
  PrepareEdDsaScalars: ['PrepareEdDsaScalars', undefined],
  EdDsaVerify: ['EdDsaVerify', undefined],
  JubjubExp36: ['JubjubExp36', undefined],

} as const;

// Type guard to check if a string is a valid SubcircuitNames
// export function isValidSubcircuitName(name: string): name is SubcircuitNames {
//   const validNames: SubcircuitNames[] = [
//     'bufferPubOut',
//     'bufferPubIn',
//     'bufferPrvOut',
//     'bufferPrvIn',
//     'ALU1',
//     'ALU2',
//     'ALU3',
//     'ALU4',
//     'ALU5',
//     'AND',
//     'OR',
//     'XOR',
//     'DecToBit',
//     'Accumulator',
//   ];
//   return validNames.includes(name as SubcircuitNames);
// }
