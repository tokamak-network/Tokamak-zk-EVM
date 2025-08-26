import { SubcircuitNames, DataPt, ArithmeticOperator, ReservedBuffer, ReservedVariable, BufferPlacement} from "../types/index.js"

export const DEFAULT_SOURCE_SIZE = 256

export const ACCUMULATOR_INPUT_LIMIT = 32

export const BUFFER_PLACEMENT: Record<ReservedBuffer, {placementIndex: number, placement: BufferPlacement}> = {
  PUB_OUT: {
    placementIndex: 0,
    placement: {
      name: 'bufferPubOut' as SubcircuitNames,
      usage: 'Buffer to emit public output',
      inPts: [] as DataPt[],
      outPts: [] as DataPt[],
    }
  },
  PUB_IN: {
    placementIndex: 1,
    placement: {
      name: 'bufferPubIn' as SubcircuitNames,
      usage: 'Buffer to load public input',
      inPts: [] as DataPt[],
      outPts: [] as DataPt[],
    }
  },
  STATIC_IN: {
    placementIndex: 2, 
    placement: {
      name: 'bufferStaticIn' as SubcircuitNames,
      usage: 'Buffer to load public static input such as ROM, environmental data, or ALU selectors',
      inPts: [] as DataPt[],
      outPts: [] as DataPt[],
    }
  },
  TRANSACTION_IN: {
    placementIndex: 3,
    placement: {
      name: 'bufferTransactionIn' as SubcircuitNames,
      usage: 'Buffer to load transactions as private',
      inPts: [] as DataPt[],
      outPts: [] as DataPt[],
    }
  },
  STORAGE_IN: {
    placementIndex: 4,
    placement: {
      name: 'bufferStorageIn' as SubcircuitNames,
      usage: 'Buffer to load initial storage data',
      inPts: [] as DataPt[],
      outPts: [] as DataPt[],
    }
  },
}

export const FIRST_ARITHMETIC_PLACEMENT_INDEX =
  Math.max(...Object.values(BUFFER_PLACEMENT).map(({ placementIndex }) => placementIndex)) + 1

export const VARIABLE_INDEX: Record<ReservedVariable, {placementIndex: number, wireIndex: number}> = {
  RES_MERKLE_ROOT: { placementIndex: BUFFER_PLACEMENT.PUB_OUT.placementIndex, wireIndex: 0 },
  INI_MERKLE_ROOT: { placementIndex: BUFFER_PLACEMENT.PUB_IN.placementIndex, wireIndex: 0 },
  EDDSA_PUBLIC_KEY_X: { placementIndex: BUFFER_PLACEMENT.PUB_IN.placementIndex, wireIndex:1 },
  EDDSA_PUBLIC_KEY_Y: { placementIndex: BUFFER_PLACEMENT.PUB_IN.placementIndex, wireIndex:2 },
  EDDSA_SIGNATURE: { placementIndex: BUFFER_PLACEMENT.PUB_IN.placementIndex, wireIndex: 3 },
  EDDSA_RANDOMIZER_X: { placementIndex: BUFFER_PLACEMENT.PUB_IN.placementIndex, wireIndex: 4 },
  EDDSA_RANDOMIZER_Y: { placementIndex: BUFFER_PLACEMENT.PUB_IN.placementIndex, wireIndex: 5 },
  ZERO: { placementIndex: BUFFER_PLACEMENT.STATIC_IN.placementIndex, wireIndex: 0 },
  ONE: { placementIndex: BUFFER_PLACEMENT.STATIC_IN.placementIndex, wireIndex: 1 },
  ADDRESS_MASK: { placementIndex: BUFFER_PLACEMENT.STATIC_IN.placementIndex, wireIndex: 2 },
  JUBJUB_BASE_X: { placementIndex: BUFFER_PLACEMENT.STATIC_IN.placementIndex, wireIndex: 3 },
  JUBJUB_BASE_Y: { placementIndex: BUFFER_PLACEMENT.STATIC_IN.placementIndex, wireIndex: 4 },
  JUBJUB_POI_X: { placementIndex: BUFFER_PLACEMENT.STATIC_IN.placementIndex, wireIndex: 5 },
  JUBJUB_POI_Y: { placementIndex: BUFFER_PLACEMENT.STATIC_IN.placementIndex, wireIndex: 6 },
  TRANSACTION_NONCE: { placementIndex: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex, wireIndex: 0 },
  CONTRACT_ADDRESS: { placementIndex: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex, wireIndex: 1 },
  FUNCTION_SELECTOR: {placementIndex: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex, wireIndex: 2 },
  TRANSACTION_INPUT0: { placementIndex: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex, wireIndex: 3},
  TRANSACTION_INPUT1: { placementIndex: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex, wireIndex: 4},
  TRANSACTION_INPUT2: { placementIndex: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex, wireIndex: 5},
  TRANSACTION_INPUT3: { placementIndex: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex, wireIndex: 6},
  TRANSACTION_INPUT4: { placementIndex: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex, wireIndex: 7},
  TRANSACTION_INPUT5: { placementIndex: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex, wireIndex: 8},
  TRANSACTION_INPUT6: { placementIndex: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex, wireIndex: 9},
  TRANSACTION_INPUT7: { placementIndex: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex, wireIndex: 10},
  TRANSACTION_INPUT8: { placementIndex: BUFFER_PLACEMENT.TRANSACTION_IN.placementIndex, wireIndex: 11},
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