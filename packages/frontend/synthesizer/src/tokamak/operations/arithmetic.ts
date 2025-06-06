import { convertToSigned } from '../utils/index.js'

import type { ArithmeticOperator } from '../types/index.js'

export type ArithmeticFunction = (...args: any) => any

/**
 * Utility class for handling Synthesizer arithmetic operations
 */
export class ArithmeticOperations {
  private static readonly MAX_UINT256 = (1n << 256n) - 1n
  private static readonly SIGN_BIT = 1n << 255n
   // N is 2^256, copied from opcodes/utils.ts. Used as modulo in EXP operations
  private static readonly N =
    BigInt(115792089237316195423570985008687907853269984665640564039457584007913129639936)

  /**
   * Basic arithmetic operations
   */
  static add(a: bigint, b: bigint): bigint {
    return (a + b) & ArithmeticOperations.MAX_UINT256
  }

  static mul(a: bigint, b: bigint): bigint {
    return (a * b) & ArithmeticOperations.MAX_UINT256
  }

  static sub(a: bigint, b: bigint): bigint {
    return (a - b) & ArithmeticOperations.MAX_UINT256
  }

  static div(a: bigint, b: bigint): bigint {
    return b === 0n ? 0n : a / b
  }

  static sdiv(a: bigint, b: bigint): bigint {
    if (b === 0n) return 0n
    const signedA = convertToSigned(a)
    const signedB = convertToSigned(b)
    const result = signedA / signedB
    return result < 0n ? ArithmeticOperations.MAX_UINT256 + result + 1n : result
  }

  /**
   * Modulo operations
   */
  static mod(a: bigint, b: bigint): bigint {
    return b === 0n ? 0n : a % b
  }

  static smod(a: bigint, b: bigint): bigint {
    if (b === 0n) return 0n
    const signedA = convertToSigned(a)
    const signedB = convertToSigned(b)
    const result = signedA % signedB
    return result < 0n ? ArithmeticOperations.MAX_UINT256 + result + 1n : result
  }

  static addmod(a: bigint, b: bigint, N: bigint): bigint {
    if (N === 0n) return 0n
    return ((a % N) + (b % N)) % N
  }

  static mulmod(a: bigint, b: bigint, N: bigint): bigint {
    if (N === 0n) return 0n
    return ((a % N) * (b % N)) % N
  }

  /**
   * @deprecated
   * Exponentiation operation
   */
  static exp(base: bigint, exponent: bigint): bigint {
    if (exponent === 0n) return 1n
    if (base === 0n) return 0n

    let result = 1n
    let currentBase = base
    let currentExp = exponent

    while (currentExp > 0n) {
      if (currentExp & 1n) {
        result = (result * currentBase) & ArithmeticOperations.MAX_UINT256
      }
      currentBase = (currentBase * currentBase) & ArithmeticOperations.MAX_UINT256
      currentExp >>= 1n
    }
    return result
  }

  /**
   * Comparison operations
   */
  static lt(a: bigint, b: bigint): bigint {
    return a < b ? 1n : 0n
  }

  static gt(a: bigint, b: bigint): bigint {
    return a > b ? 1n : 0n
  }

  static slt(a: bigint, b: bigint): bigint {
    return convertToSigned(a) < convertToSigned(b) ? 1n : 0n
  }

  static sgt(a: bigint, b: bigint): bigint {
    return convertToSigned(a) > convertToSigned(b) ? 1n : 0n
  }

  static eq(a: bigint, b: bigint): bigint {
    return a === b ? 1n : 0n
  }

  static iszero(a: bigint): bigint {
    return a === 0n ? 1n : 0n
  }

  /**
   * Bit operations
   */
  static and(a: bigint, b: bigint): bigint {
    return a & b
  }

  static or(a: bigint, b: bigint): bigint {
    return a | b
  }

  static xor(a: bigint, b: bigint): bigint {
    return a ^ b
  }

  static not(a: bigint): bigint {
    return ~a & ArithmeticOperations.MAX_UINT256
  }

  /**
   * Shift operations
   */
  static shl(shift: bigint, value: bigint): bigint {
    return shift >= 256n ? 0n : (value << shift) & ArithmeticOperations.MAX_UINT256
  }

  static shr(shift: bigint, value: bigint): bigint {
    return shift >= 256n ? 0n : value >> shift
  }

  static sar(shift: bigint, value: bigint): bigint {
    if (shift >= 256n) {
      return (value & (1n << 255n)) === 0n ? 0n : ArithmeticOperations.MAX_UINT256
    }

    const isNegative = (value & (1n << 255n)) !== 0n
    if (isNegative) {
      const mask = ArithmeticOperations.MAX_UINT256 << (256n - shift)
      // Apply the mask to the shifted value and ensure the result is within 256 bits
      return BigInt.asUintN(256, (value >> shift) | mask)
    }
    // For non-negative values, simply shift right
    return value >> shift
  }

  /**
   * Byte operations
   */
  static byte(index: bigint, value: bigint): bigint {
    if (index >= 32n) return 0n
    const shiftBits = (31n - index) * 8n
    return (value >> shiftBits) & 0xffn
  }

  /**
   * Sign extension
   */
  static signextend(k: bigint, value: bigint): bigint {
    if (k > 31n) return value

    const bitPos = (k + 1n) * 8n - 1n
    const signBit = (value >> bitPos) & 1n

    if (signBit === 1n) {
      const mask = ((1n << (256n - bitPos)) - 1n) << bitPos
      return value | mask
    } else {
      const mask = (1n << (bitPos + 1n)) - 1n
      return value & mask
    }
  }

  /**
   * Decimal to Bit
   */
  static decToBit(dec: bigint): bigint[] {
    const binaryString = dec.toString(2)
    const paddedBinaryString = binaryString.padStart(256, '0')
    const bits = Array.from(paddedBinaryString, (bit) => BigInt(bit))
    return bits
  }

  /**
   * Subroutine for EXP
   */
  static subEXP(c: bigint, a: bigint, b: bigint): bigint[] {
    if (!(b === 0n || b === 1n)) {
      throw new Error(`Synthesizer: ArithmeticOperations: subEXP: b is not binary`)
    }
    const aOut = (a * a) % ArithmeticOperations.N
    const cOut = (c * (b * a + (1n - b))) % ArithmeticOperations.N // <=> c * (b ? aOut : 1)
    return [cOut, aOut]
  }

  /**
   * Accumulator
   */
  static accumulator(in_vals: bigint[]): bigint {
    let acc = 0n
    for (const in_val of in_vals) {
      acc += in_val;
    }
    return acc
  }
}

// Operator and function mapping
export const OPERATION_MAPPING: Record<ArithmeticOperator, ArithmeticFunction> = {
  ADD: ArithmeticOperations.add,
  MUL: ArithmeticOperations.mul,
  SUB: ArithmeticOperations.sub,
  DIV: ArithmeticOperations.div,
  SDIV: ArithmeticOperations.sdiv,
  MOD: ArithmeticOperations.mod,
  SMOD: ArithmeticOperations.smod,
  ADDMOD: ArithmeticOperations.addmod,
  MULMOD: ArithmeticOperations.mulmod,
  EXP: ArithmeticOperations.exp,
  LT: ArithmeticOperations.lt,
  GT: ArithmeticOperations.gt,
  SLT: ArithmeticOperations.slt,
  SGT: ArithmeticOperations.sgt,
  EQ: ArithmeticOperations.eq,
  ISZERO: ArithmeticOperations.iszero,
  AND: ArithmeticOperations.and,
  OR: ArithmeticOperations.or,
  XOR: ArithmeticOperations.xor,
  NOT: ArithmeticOperations.not,
  SHL: ArithmeticOperations.shl,
  SHR: ArithmeticOperations.shr,
  SAR: ArithmeticOperations.sar,
  BYTE: ArithmeticOperations.byte,
  SIGNEXTEND: ArithmeticOperations.signextend,
  DecToBit: ArithmeticOperations.decToBit,
  SubEXP: ArithmeticOperations.subEXP,
  Accumulator: ArithmeticOperations.accumulator,
} as const
