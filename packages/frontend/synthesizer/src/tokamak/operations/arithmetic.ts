import { convertToSigned } from '../utils/index.js'
import { poseidon4 } from 'poseidon-bls12381';

import type { ArithmeticOperator } from '../types/index.js'

export type ArithmeticFunction = (...args: any) => any

/**
 * Utility class for handling Synthesizer arithmetic operations
 */
export class ArithmeticOperations {
  private static readonly MAX_UINT256 = (1n << 256n) - 1n
  private static readonly SIGN_BIT = 1n << 255n
   // N is 2^256, copied from opcodes/utils.ts. Used as modulo in EXP operations
  private static readonly N = 1n << 256n
  private static readonly BLS12381MODULUS = BigInt('0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001')
  private static readonly JUBJUBMODULUS = BigInt('0xe7db4ea6533afa906673b0101343b00a6682093ccc81082d0970e5ed6f72cb7')
  /**
   * Basic arithmetic operations
   */
  static add(ins: bigint[]): bigint {
    if (ins.length !== 2) {
      throw new Error('add expected two inputs')
    }
    return (ins[0] + ins[1]) & ArithmeticOperations.MAX_UINT256
  }

  static mul(ins: bigint[]): bigint {
    if (ins.length !== 2) {
      throw new Error('mul expected two inputs')
    }
    return (ins[0] + ins[1]) & ArithmeticOperations.MAX_UINT256
  }

  static sub(ins: bigint[]): bigint {
    if (ins.length !== 2) {
      throw new Error('sub expected two inputs')
    }
    return (ins[0] + ins[1]) & ArithmeticOperations.MAX_UINT256
  }

  static div(ins: bigint[]): bigint {
    if (ins.length !== 2) {
      throw new Error('div expected two inputs')
    }
    return ins[1] === 0n ? 0n : ins[0] / ins[1]
  }

  static sdiv(ins: bigint[]): bigint {
    if (ins.length !== 2) {
      throw new Error('sdiv expected two inputs')
    }
    if (ins[1] === 0n) return 0n
    const signedA = convertToSigned(ins[0])
    const signedB = convertToSigned(ins[1])
    const result = signedA / signedB
    return result < 0n ? ArithmeticOperations.MAX_UINT256 + result + 1n : result
  }

  /**
   * Modulo operations
   */
  static mod(ins: bigint[]): bigint {
    if (ins.length !== 2) {
      throw new Error('mod expected two inputs')
    }
    return ins[1] === 0n ? 0n : ins[0] % ins[1]
  }

  static smod(ins: bigint[]): bigint {
    if (ins.length !== 2) {
      throw new Error('smod expected two inputs')
    }
    if (ins[1] === 0n) return 0n
    const signedA = convertToSigned(ins[0])
    const signedB = convertToSigned(ins[1])
    const result = signedA % signedB
    return result < 0n ? ArithmeticOperations.MAX_UINT256 + result + 1n : result
  }

  static addmod(ins: bigint[]): bigint {
    if (ins.length !== 3) {
      throw new Error('addmod expected three inputs')
    }
    if (ins[2] === 0n) return 0n
    return ((ins[0] % ins[2]) + (ins[1] % ins[2])) % ins[2]
  }

  static mulmod(ins: bigint[]): bigint {
    if (ins.length !== 3) {
      throw new Error('mulmod expected three inputs')
    }
    if (ins[2] === 0n) return 0n
    return ((ins[0] % ins[2]) * (ins[1] % ins[2])) % ins[2]
  }

  // /**
  //  * @deprecated
  //  * Exponentiation operation
  //  */
  // static exp(ins: bigint[]): bigint {
  //   const base = ins[0]
  //   const exponent = ins[1]
  //   if (exponent === 0n) return 1n
  //   if (base === 0n) return 0n

  //   let result = 1n
  //   let currentBase = base
  //   let currentExp = exponent

  //   while (currentExp > 0n) {
  //     if (currentExp & 1n) {
  //       result = (result * currentBase) & ArithmeticOperations.MAX_UINT256
  //     }
  //     currentBase = (currentBase * currentBase) & ArithmeticOperations.MAX_UINT256
  //     currentExp >>= 1n
  //   }
  //   return result
  // }

  /**
   * Comparison operations
   */
  static lt(ins: bigint[]): bigint {
    if (ins.length !== 2) {
      throw new Error('lt expected two inputs')
    }
    return ins[0] < ins[1] ? 1n : 0n
  }

  static gt(ins: bigint[]): bigint {
    if (ins.length !== 2) {
      throw new Error('gt expected two inputs')
    }
    return ins[0] > ins[1] ? 1n : 0n
  }

  static slt(ins: bigint[]): bigint {
    if (ins.length !== 2) {
      throw new Error('slt expected two inputs')
    }
    return convertToSigned(ins[0]) < convertToSigned(ins[1]) ? 1n : 0n
  }

  static sgt(ins: bigint[]): bigint {
    if (ins.length !== 2) {
      throw new Error('sgt expected two inputs')
    }
    return convertToSigned(ins[0]) > convertToSigned(ins[1]) ? 1n : 0n
  }

  static eq(ins: bigint[]): bigint {
    if (ins.length !== 2) {
      throw new Error('eq expected two inputs')
    }
    return ins[0] === ins[1] ? 1n : 0n
  }

  static iszero(ins: bigint[]): bigint {
    if (ins.length !== 1) {
      throw new Error('iszero expected one input')
    }
    return ins[0] === 0n ? 1n : 0n
  }

  /**
   * Bit operations
   */
  static and(ins: bigint[]): bigint {
    if (ins.length !== 2) {
      throw new Error('and expected two inputs')
    }
    return ins[0] & ins[1]
  }

  static or(ins: bigint[]): bigint {
    if (ins.length !== 2) {
      throw new Error('or expected two inputs')
    }
    return ins[0] | ins[1]
  }

  static xor(ins: bigint[]): bigint {
    if (ins.length !== 2) {
      throw new Error('xor expected two inputs')
    }
    return ins[0] ^ ins[1]
  }

  static not(ins: bigint[]): bigint {
    if (ins.length !== 1) {
      throw new Error('not expected one input')
    }
    return ~ins[0] & ArithmeticOperations.MAX_UINT256
  }

  /**
   * Shift operations
   */
  static shl(ins: bigint[]): bigint {
    if (ins.length !== 2) {
      throw new Error('shl expected two inputs')
    }
    const shift = ins[0]
    const value = ins[1]
    return shift >= 256n ? 0n : (value << shift) & ArithmeticOperations.MAX_UINT256
  }

  static shr(ins: bigint[]): bigint {
    if (ins.length !== 2) {
      throw new Error('shr expected two inputs')
    }
    const shift = ins[0]
    const value = ins[1]
    return shift >= 256n ? 0n : value >> shift
  }

  static sar(ins: bigint[]): bigint {
    if (ins.length !== 2) {
      throw new Error('sar expected two inputs')
    }
    const shift = ins[0]
    const value = ins[1]
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
  static byte(ins: bigint[]): bigint {
    if (ins.length !== 2) {
      throw new Error('byte expected two inputs')
    }
    const index = ins[0]
    const value = ins[1]
    if (index >= 32n) return 0n
    const shiftBits = (31n - index) * 8n
    return (value >> shiftBits) & 0xffn
  }

  /**
   * Sign extension
   */
  static signextend(ins: bigint[]): bigint {
    if (ins.length !== 2) {
      throw new Error('signextend expected two inputs')
    }
    const k = ins[0]
    const value = ins[1]
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
  static decToBit(ins: bigint[]): bigint[] {
    if (ins.length !== 1){
      throw new Error('decToBit expected one input')
    }
    const binaryString = ins[0].toString(2)
    const paddedBinaryString = binaryString.padStart(256, '0')
    const bits = Array.from(paddedBinaryString, (bit) => BigInt(bit))
    return bits
  }

  /**
   * Subroutine for EXP
   */
  static subEXP(ins: bigint[]): bigint[] {
    if (ins.length !== 3) {
      throw new Error('subEXP expected three inputs')
    }
    const c = ins[0];
    const a = ins[1];
    const b = ins[2];
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

  /**
   * Poseidon4
   */
  static poseidon4(in_vals: bigint[]): bigint {
    if (in_vals.length !== 4) {
      throw new Error('poseidon4 expected exactly four input values')
    }
    const modded: bigint[] = []
    for (const in_val of in_vals) {
      modded.push(in_val & this.BLS12381MODULUS)
    }
    return poseidon4(modded)
  }

  /**
   * PrepareEdDsaScalars
   */
  static prepareEdDsaScalars(in_vals: bigint[]): bigint[] {
    if (in_vals.length !== 2) {
      throw new Error('prepareEdDsaScalars expected exactly two input values')
    }
    const sign = in_vals[0]
    const poseidonOut = in_vals[1]
    const modded: bigint[] = [sign & this.JUBJUBMODULUS, poseidonOut & this.JUBJUBMODULUS]
    const bits: bigint[] = []
    for (const val of modded) {
      const binaryString = val.toString(2)
      const paddedBinaryString = binaryString.padStart(252, '0')
      bits.push(...Array.from(paddedBinaryString, (bit) => BigInt(bit)))
    }
    return bits
  }

  private static _bls12381Arith(): {mod: Function, add: Function, sub: Function, mul: Function} {
    const mod = (x: bigint) => ((x % this.BLS12381MODULUS) + this.BLS12381MODULUS) % this.BLS12381MODULUS;
    const add = (a: bigint, b: bigint) => mod(a + b);
    const sub = (a: bigint, b: bigint) => mod(a - b);
    const mul = (a: bigint, b: bigint) => mod(a * b);
    return {mod, add, sub, mul}
  }

  /**
   * JubjubAdd
   */

  private static _jubjubAdd(in1: bigint[], in2:bigint[]): bigint[] {
    const D = 19257038036680949359750312669786877991949435402254120286184196891950884077233n;
    const {mod, add, sub, mul} = this._bls12381Arith()
    
    const inv = (a: bigint): bigint => {
      let t = 0n, newT = 1n;
      let r = this.BLS12381MODULUS, newR = mod(a);
      while (newR !== 0n) {
        const q = r / newR;
        [t, newT] = [newT, t - q * newT];
        [r, newR] = [newR, r - q * newR];
      }
      if (r !== 1n) throw new Error("inverse does not exist");
      return t < 0n ? t + this.BLS12381MODULUS : t;
    }

    // t = d * in1[0]*in2[0]*in1[1]*in2[1]
    // denX = 1 + t;
    // denY = 1 - t;
    let denX: bigint, denY: bigint;
    let inter1: bigint, inter2: bigint, inter3: bigint;

    inter1 = mul(D, in1[0]);
    inter2 = mul(inter1, in2[0]);
    inter3 = mul(inter2, in1[1]);
    denX = add(1n, mul(inter3, in2[1]));
    denY = sub(1n, mul(inter3, in2[1]));

    // Numerators
    let numX: bigint;
    const term1 = mul(in1[0], in2[1]);
    numX = add(term1, mul(in1[1], in2[0]));
    // in[1] numerator = in1[1]*in2[1] - a*in1[0]*in2[0]; with a = -1 => in1[1]*in2[1] + in1[0]*in2[0]
    let numY: bigint;
    const term2 = mul(in1[1], in2[1]);
    numY = add(term2, mul(in1[0], in2[0]));

    // Enforce out[0] = numX / denX  and  out[1] = numY / denY
    // (division by multiplying both sides by denominators)
    const out0 = mul(numX, inv(denX)); // out[0] <-- numX \ denX;  numX === out[0] * denX;
    const out1 = mul(numY, inv(denY)); // out[1] <-- numY \ denY;  numY === out[1] * denY;
    return [out0, out1];
  }

  private static _jubjubSubExp (P_prev: bigint[], G_prev: bigint[], b: 0n | 1n): { P_next: bigint[]; G_next: bigint[] } {
    // G_next <== G_prev + G_prev
    const G_next = this._jubjubAdd(G_prev, G_prev);

    // P_next <== P_prev + ( b ? G_next : O )
    const P_next = b === 0n ? P_prev : this._jubjubAdd(P_prev, G_next) 
    return { P_next, G_next };
  }

  /**
   * JubjubExp36
   */
  static jubjubExp36(in_vals: bigint[]): bigint[] {
    const Nbits= 36
    if (in_vals.length !== 4 + Nbits) {
      throw new Error('jubjubExp36 expected exactly 40 input values')
    }
    for (var i = 0; i < 4; i++) {
      if (in_vals[i] >= this.BLS12381MODULUS) {
        throw new Error('jubjubExp36 input curve points must be of Jubjub')
      }
    }
    let P_point: bigint[] = in_vals.slice(0, 2)
    let G_point: bigint[] = in_vals.slice(2, 4)
    const b_bits: (0n | 1n)[] = []
    for (var i = 0; i < Nbits; i++) {
      const bit = in_vals[i+4]
      if (bit !== 0n && bit !== 1n) {
        throw new Error('jubjubExp36 input scalar bits must be binary')
      } else {
        b_bits.push(bit)
      }
    }

    for (let i = 0; i < Nbits; i++) {
      const { P_next, G_next } = this._jubjubSubExp(P_point, G_point, b_bits[i]);
      P_point = P_next
      G_point = G_next
    }
    return [...P_point, ...G_point]
  }

  /**
   * EdDsaVerify
   */
  static edDsaVerify(in_vals: bigint[]): bigint[] {
    const {mod, add, sub, mul} = this._bls12381Arith()
    
    const jubjubCheck = (point: bigint[]): void => {
      var A = 52435875175126190479447740508185965837690552500527637822603658699938581184512n;
      var D = 19257038036680949359750312669786877991949435402254120286184196891950884077233n;
      if (point.length !== 2) {
        throw new Error ('Input is not a point')
      }
      const x_sq = mul(point[0], point[0])
      const y_sq = mul(point[1], point[1])
      const lhs = add(mul(A, x_sq), y_sq)
      const rhs = add(mul(mul(x_sq, y_sq), D), 1n)
      if (lhs !== rhs) {
        throw new Error('jubjub point check failed')
      }
    }

    if (in_vals.length !== 6 ) {
      throw new Error('edDsaVerify expected three jubjub input points')
    }
    for (var i = 0; i < 6; i++) {
      if (in_vals[i] >= this.BLS12381MODULUS) {
        throw new Error('jubjubExp36 input curve points must be of Jubjub')
      }
    }

    const sG: bigint[] = in_vals.slice(0, 2)
    const R: bigint[] = in_vals.slice(2, 4)
    const eA: bigint[] = in_vals.slice(4, 6)
    jubjubCheck(sG)
    jubjubCheck(R)
    jubjubCheck(eA)
    const RHS: bigint[] = this._jubjubAdd(R, eA)
    if ( sG[0] !== RHS[0] || sG[1] !== RHS[1] ){
      throw new Error('edDsaVerifiy failed')
    }
    return []
  }
}

// Operator and function mapping
export const ARITHMETIC_MAPPING: Record<ArithmeticOperator, ArithmeticFunction> = {
  ADD: ArithmeticOperations.add,
  MUL: ArithmeticOperations.mul,
  SUB: ArithmeticOperations.sub,
  DIV: ArithmeticOperations.div,
  SDIV: ArithmeticOperations.sdiv,
  MOD: ArithmeticOperations.mod,
  SMOD: ArithmeticOperations.smod,
  ADDMOD: ArithmeticOperations.addmod,
  MULMOD: ArithmeticOperations.mulmod,
  EXP: ArithmeticOperations.subEXP, //not directly used
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
  Poseidon4: ArithmeticOperations.poseidon4,
  PrepareEdDsaScalars: ArithmeticOperations.prepareEdDsaScalars,
  JubjubExp36: ArithmeticOperations.jubjubExp36,
  EdDsaVerify: ArithmeticOperations.edDsaVerify,
} as const
