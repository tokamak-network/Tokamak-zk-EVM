import { SubcircuitNames, DataPt, ArithmeticOperator, ReservedBuffer, ReservedVariable, BufferPlacement, DataPtDescription, BUFFER_PLACEMENT} from "../types/index.js"

export const BLS12831MODULUS = 52435875175126190479447740508185965837690552500527637822603658699938581184513n
export const DEFAULT_SOURCE_SIZE = 256
export const ACCUMULATOR_INPUT_LIMIT = 32
export const MAX_TX_NUMBER = 16
export const MAX_MT_LEAVES = 16
export const FIRST_ARITHMETIC_PLACEMENT_INDEX =
  Math.max(...Object.values(BUFFER_PLACEMENT).map(({ placementIndex }) => placementIndex)) + 1

export const USER_INPUT_DYNAMIC_INDEX = 0x03
