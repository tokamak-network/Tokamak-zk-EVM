import { jubjub } from "@noble/curves/misc.js"
import { poseidon_raw, poseidonN2xCompress } from "tokamak-l2js"
import { ARITH_EXP_BATCH_SIZE, JUBJUB_EXP_BATCH_SIZE, POSEIDON_INPUTS } from "../../interface/qapCompiler/importedConstants.ts"
import { DEFAULT_SOURCE_BIT_SIZE} from "../../synthesizer/params/index.ts"

const convertToSigned = (value: bigint): bigint => {
  const SIGN_BIT = 1n << 255n
  return (value & SIGN_BIT) !== 0n ? value - (1n << 256n) : value
}
/**
 * Utility class for handling Synthesizer arithmetic operations
 */
export class ArithmeticOperations {
  private static readonly MAX_UINT256 = (1n << 256n) - 1n
  private static readonly SIGN_BIT = 1n << 255n
   // N is 2^256, copied from opcodes/utils.ts. Used as modulo in EXP operations
  private static readonly N = 1n << 256n
  private static readonly BLS12381MODULUS = jubjub.Point.Fp.ORDER
  private static readonly JUBJUBMODULUS = jubjub.Point.Fn.ORDER
  // Convert to signed integer (256-bit)
  
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
    return (ins[0] * ins[1]) & ArithmeticOperations.MAX_UINT256
  }

  static sub(ins: bigint[]): bigint {
    if (ins.length !== 2) {
      throw new Error('sub expected two inputs')
    }
    return (ins[0] - ins[1]) & ArithmeticOperations.MAX_UINT256
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
    const binaryString = ins[0].toString(2) // MSB-left
    const paddedBinaryString = binaryString.padStart(256, '0') // left-padding
    const bits = Array.from(paddedBinaryString, (bit) => BigInt(bit)).reverse() //LSB-left
    if (bits.length > DEFAULT_SOURCE_BIT_SIZE) {
      throw new Error('Input value exceeds 256-bit word')
    }
    return bits
  }

  // /**
  //  * Subroutine for EXP
  //  */
  // static subEXP(ins: bigint[]): bigint[] {
  //   if (ins.length !== 3) {
  //     throw new Error('subEXP expected three inputs')
  //   }
  //   const c = ins[0];
  //   const a = ins[1];
  //   const b = ins[2];
  //   if (!(b === 0n || b === 1n)) {
  //     throw new Error(`Synthesizer: ArithmeticOperations: subEXP: b is not binary`)
  //   }
  //   const aOut = (a * a) % ArithmeticOperations.N
  //   const cOut = (c * (b * a + (1n - b))) % ArithmeticOperations.N // <=> c * (b ? aOut : 1)
  //   return [cOut, aOut]
  // }

  /**
   * SubExpBatch
   */
  static subExpBatch(in_vals: bigint[]): bigint[] {
    const modPow = (base: bigint, exp: bigint, M: bigint) => {
      let res = 1n, b = base % M, e = exp;
      while (e > 0n) { if (e & 1n) res = (res * b) % M; b = (b * b) % M; e >>= 1n; }
      return res;
    };

    const Nbits= ARITH_EXP_BATCH_SIZE
    if (in_vals.length !== 2 + Nbits) {
      throw new Error(`subExpBatch expected exactly ${2 + Nbits} input values, but got ${in_vals.length} values`)
    }
    const c = in_vals[0]
    const a = in_vals[1]
    // Input bits should be LSB-first.
    const scalarBitsMSB = in_vals.slice(2, ).reverse()
    if (scalarBitsMSB.some(b => b !== 0n && b !== 1n)) {
      throw new Error('subExpBatch: scalar bits must be 0n or 1n');
    }

    const exponent = scalarBitsMSB.reduce((acc, b) => (acc << 1n) | b, 0n)
    const a_next = modPow(a, 1n << BigInt(Nbits), ArithmeticOperations.N);
    const c_next = (c * modPow(a, exponent, ArithmeticOperations.N)) % ArithmeticOperations.N;
    return [c_next, a_next]
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
   * PoseidonN
   */
  static poseidonN(in_vals: bigint[]): bigint {
    return poseidon_raw(in_vals)
  }

  /**
   * PoseidonN2xCompress
   */
  static poseidonN2xCompress(in_vals: bigint[]): bigint {
    return poseidonN2xCompress(in_vals)
  }

  // /**
  //  * PrepareEdDsaScalars
  //  */
  // static prepareEdDsaScalars(in_vals: bigint[]): bigint[] {
  //   if (in_vals.length !== 2) {
  //     throw new Error('prepareEdDsaScalars expected exactly two input values')
  //   }
  //   const sign = in_vals[0]
  //   const poseidonOut = in_vals[1]
  //   const modded: bigint[] = [sign % jubjub.Point.Fn.ORDER, poseidonOut % jubjub.Point.Fn.ORDER]
  //   const bits: bigint[] = []
  //   for (const val of modded) {
  //     // MSB-left
  //     const binaryString = val.toString(2)
  //     const paddedBinaryString = binaryString.padStart(252, '0')
  //     // LSB-left
  //     bits.push(...Array.from(paddedBinaryString, (bit) => BigInt(bit)).reverse())
  //   }
    
  //   return bits
  // }

  private static _bls12381Arith(): {mod: Function, add: Function, sub: Function, mul: Function} {
    const mod = (x: bigint) => ((x % ArithmeticOperations.BLS12381MODULUS) + ArithmeticOperations.BLS12381MODULUS) % ArithmeticOperations.BLS12381MODULUS;
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
    if ( jubjub.Point.CURVE().d !== D) {
        throw new Error('Jubjub parameter mismatch')
    }
    const {mod, add, sub, mul} = ArithmeticOperations._bls12381Arith()
    
    const inv = (a: bigint): bigint => {
      let t = 0n, newT = 1n;
      let r = ArithmeticOperations.BLS12381MODULUS, newR = mod(a);
      while (newR !== 0n) {
        const q = r / newR;
        [t, newT] = [newT, t - q * newT];
        [r, newR] = [newR, r - q * newR];
      }
      if (r !== 1n) throw new Error("inverse does not exist");
      return t < 0n ? t + ArithmeticOperations.BLS12381MODULUS : t;
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

    // TESTED
    const in1Point = jubjub.Point.fromAffine({x: in1[0], y: in1[1]})
    const in2Point = jubjub.Point.fromAffine({x: in2[0], y: in2[1]})
    const outPoint = in1Point.add(in2Point)
    if ( !jubjub.Point.fromAffine({x: out0, y: out1}).equals(outPoint) ) {
        throw new Error('Jubjub addition mismatch from the reference')
    }
    return [out0, out1];
  }

  // private static _jubjubSubExp (P_prev: bigint[], G_prev: bigint[], b: 0n | 1n): { P_next: bigint[]; G_next: bigint[] } {
    
  //   // P_next <== P_prev + ( b ? G_prev : O )
  //   const P_next = b === 0n ? P_prev : ArithmeticOperations._jubjubAdd(P_prev, G_prev) 
  //   // G_next <== G_prev + G_prev
  //   const G_next = ArithmeticOperations._jubjubAdd(G_prev, G_prev);

  //   //TESTED
  //   const G_prev_point = jubjub.Point.fromAffine({x: G_prev[0], y:G_prev[1]})
  //   const G_next_plain = G_prev_point.add(G_prev_point)
  //   const G_next_point = jubjub.Point.fromAffine({x: G_next[0], y:G_next[1]})
  //   const P_prev_point = jubjub.Point.fromAffine({x: P_prev[0], y:P_prev[1]})
  //   const P_next_point = jubjub.Point.fromAffine({x: P_next[0], y:P_next[1]})
  //   const P_next_plain = P_prev_point.add(b === 1n ? G_prev_point : jubjub.Point.ZERO)
  //   if (!P_next_point.equals(P_next_plain) || !G_next_point.equals(G_next_plain)) {
  //       throw new Error('Jubjub subExp mismatch from the reference')
  //   }

  //   return { P_next, G_next };

    
  // }

  // /**
  //  * JubjubExp36
  //  */
  // static jubjubExp36(in_vals: bigint[]): bigint[] {
  //   const Nbits= 36
  //   if (in_vals.length !== 4 + Nbits) {
  //     throw new Error(`jubjubExp36 expected exactly 40 input values, but got ${in_vals.length} values`)
  //   }
  //   for (var i = 0; i < 4; i++) {
  //     if (in_vals[i] >= ArithmeticOperations.BLS12381MODULUS) {
  //       throw new Error('jubjubExp36 input curve points must be of Jubjub')
  //     }
  //   }
  //   const _P_point: bigint[] = in_vals.slice(0, 2)
  //   const _G_point: bigint[] = in_vals.slice(2, 4)
  //   const scalarBitsMSB = in_vals.slice(4, 4 + Nbits)
    
  //   const b_bits: (0n | 1n)[] = scalarBitsMSB.map((b) => {
  //       if (b !== 0n && b !== 1n) throw new Error('jubjubExp36 input scalar bits must be binary');
  //       return b;
  //   }).reverse();

  //   let P_point = _P_point.slice()
  //   let G_point = _G_point.slice()
  //   for (let i = 0; i < Nbits; i++) {
  //     const { P_next, G_next } = ArithmeticOperations._jubjubSubExp(P_point, G_point, b_bits[i]);
  //     P_point = P_next
  //     G_point = G_next
  //   }

  //   //TESTED
  //   const G_edwards = jubjub.Point.fromAffine({x: _G_point[0], y: _G_point[1]})
  //   const P_ini_edwards = jubjub.Point.fromAffine({x: _P_point[0], y: _P_point[1]})
  //   const exponent = scalarBitsMSB.reduce((acc, b) => (acc << 1n) | b, 0n)
  //   const P_plain = G_edwards.multiply(exponent).add(P_ini_edwards)
  //   const P_edwards = jubjub.Point.fromAffine({x: P_point[0], y: P_point[1]})
  //   if (!P_plain.equals(P_edwards)) {
  //       throw new Error('JubjubExp36 mismatch from the reference')
  //   }
  //   return [...P_point, ...G_point]
  // }

  /**
   * JubjubExpBatch
   */
  static jubjubExpBatch(in_vals: bigint[]): bigint[] {
    const Nbits= JUBJUB_EXP_BATCH_SIZE
    if (in_vals.length !== 4 + Nbits) {
      throw new Error(`jubjubExpBatch expected exactly ${4 + Nbits} input values, but got ${in_vals.length} values`)
    }
    const P_point: bigint[] = in_vals.slice(0, 2)
    const G_point: bigint[] = in_vals.slice(2, 4)
    const scalarBitsMSB = in_vals.slice(4, ).reverse()

    const G_edwards = jubjub.Point.fromAffine({x: G_point[0], y: G_point[1]})
    const P_edwards = jubjub.Point.fromAffine({x: P_point[0], y: P_point[1]})
    const exponent = scalarBitsMSB.reduce((acc, b) => (acc << 1n) | b, 0n)
    const G_next_edwards = G_edwards.multiply(BigInt(2**Nbits))
    const P_next_edwards = G_edwards.multiply(exponent).add(P_edwards)
    const P_next_point = [P_next_edwards.toAffine().x, P_next_edwards.toAffine().y]
    const G_next_point = [G_next_edwards.toAffine().x, G_next_edwards.toAffine().y]
  
    return [...P_next_point, ...G_next_point]
  }

  /**
   * EdDsaVerify
   */
  static edDsaVerify(in_vals: bigint[]): bigint[] {
    const {mod, add, sub, mul} = ArithmeticOperations._bls12381Arith()
    
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
      if (in_vals[i] >= ArithmeticOperations.BLS12381MODULUS) {
        throw new Error('jubjubExpBatch input curve points must be of Jubjub')
      }
    }

    const sG: bigint[] = in_vals.slice(0, 2)
    const R: bigint[] = in_vals.slice(2, 4)
    const eA: bigint[] = in_vals.slice(4, 6)
    jubjubCheck(sG)
    jubjubCheck(R)
    jubjubCheck(eA)
    const RHS: bigint[] = ArithmeticOperations._jubjubAdd(R, eA)
    
    if ( sG[0] !== RHS[0] || sG[1] !== RHS[1] ){
      throw new Error('edDsaVerifiy failed')
    }
    return []
  }

  // Old version: Reconstructing the Merkle tree root
  // /**
  //  * VerifyMerkleProof
  //  */
  // static verifyMerkleProof(inVals: bigint[]): bigint[] {

  //   if (inVals.length !== 1 + POSEIDON_INPUTS) {
  //     throw new Error(`VerifyMerkleProof expected exactly ${1 + POSEIDON_INPUTS} input values, but got ${inVals.length} values`)
  //   }
  //   const children = inVals.slice(0, POSEIDON_INPUTS)
  //   const parent = inVals[inVals.length - 1]
  //   // console.log(`children: ${children}`)
  //   // console.log(`parent: ${parent}`)
  //   if (
  //     parent !== poseidon_raw(children)
  //   ) {
  //     throw new Error('verifyMerkleProof failed')
  //   }
  //   return []
  // }

  /**
   * VerifyMerkleProof
   */
  static verifyMerkleProof(inVals: bigint[]): bigint[] {
    const nSiblings = POSEIDON_INPUTS - 1
    const nIns = 4 + nSiblings
    if (inVals.length !== nIns) {
      throw new Error(`VerifyMerkleProof expected exactly ${nIns} input values, but got ${inVals.length} values`)
    }
    const childIndex = Number(inVals[0])
    const childHomeIndex = childIndex % POSEIDON_INPUTS
    const child = inVals[1]
    const siblings = inVals.slice(2, 2 + nSiblings)
    const parentIndex = Number(inVals[nIns - 2])
    const parent = inVals[nIns - 1]

    const children = [
      ...siblings.slice(0, childHomeIndex),
      child,
      ...siblings.slice(childHomeIndex, ),
    ]

    if (
      parent !== poseidon_raw(children) ||
      parentIndex !== Math.floor(childIndex / POSEIDON_INPUTS)
    ) {
      throw new Error('verifyMerkleProof failed')
    }
    return []
  }

  /**
   * VerifyMerkleProof2x
   */
  static verifyMerkleProof2x(inVals: bigint[]): bigint[] {
    const nSiblings = POSEIDON_INPUTS - 1
    const nIns = 4 + 2 * nSiblings
    if (inVals.length !== nIns) {
      throw new Error(`VerifyMerkleProof expected exactly ${nIns} input values, but got ${inVals.length} values`)
    }

    const childIndex = Number(inVals[0])
    const child = inVals[1]
    const parentIndex = Number(inVals[nIns - 2])
    const parent = inVals[nIns - 1]

    const siblings1 = inVals.slice(2, 2 + nSiblings)
    const siblings2 = inVals.slice(2 + nSiblings, 2 + 2 * nSiblings)

    const childHomeIndex = childIndex % POSEIDON_INPUTS
    const firstChildren = [
      ...siblings1.slice(0, childHomeIndex),
      child,
      ...siblings1.slice(childHomeIndex),
    ]
    const firstParent = poseidon_raw(firstChildren)
    const firstParentIndex = Math.floor(childIndex / POSEIDON_INPUTS)
    const firstParentHomeIndex = firstParentIndex % POSEIDON_INPUTS

    const secondChildren = [
      ...siblings2.slice(0, firstParentHomeIndex),
      firstParent,
      ...siblings2.slice(firstParentHomeIndex),
    ]
    const secondParentIndex = Math.floor(firstParentIndex / POSEIDON_INPUTS)

    if (parent !== poseidon_raw(secondChildren) || parentIndex !== secondParentIndex) {
      throw new Error('verifyMerkleProof failed')
    }
    return []
  }

  /**
   * VerifyMerkleProof3x
   */
  static verifyMerkleProof3x(inVals: bigint[]): bigint[] {
    const nSiblings = POSEIDON_INPUTS - 1
    const nIns = 4 + 3 * nSiblings
    if (inVals.length !== nIns) {
      throw new Error(`VerifyMerkleProof expected exactly ${nIns} input values, but got ${inVals.length} values`)
    }

    const childIndex = Number(inVals[0])
    const child = inVals[1]
    const parentIndex = Number(inVals[nIns - 2])
    const parent = inVals[nIns - 1]

    const siblings1 = inVals.slice(2, 2 + nSiblings)
    const siblings2 = inVals.slice(2 + nSiblings, 2 + 2 * nSiblings)
    const siblings3 = inVals.slice(2 + 2 * nSiblings, 2 + 3 * nSiblings)

    const childHomeIndex = childIndex % POSEIDON_INPUTS
    const firstChildren = [
      ...siblings1.slice(0, childHomeIndex),
      child,
      ...siblings1.slice(childHomeIndex),
    ]
    const firstParent = poseidon_raw(firstChildren)
    const firstParentIndex = Math.floor(childIndex / POSEIDON_INPUTS)
    const firstParentHomeIndex = firstParentIndex % POSEIDON_INPUTS

    const secondChildren = [
      ...siblings2.slice(0, firstParentHomeIndex),
      firstParent,
      ...siblings2.slice(firstParentHomeIndex),
    ]
    const secondParent = poseidon_raw(secondChildren)
    const secondParentIndex = Math.floor(firstParentIndex / POSEIDON_INPUTS)
    const secondParentHomeIndex = secondParentIndex % POSEIDON_INPUTS

    const thirdChildren = [
      ...siblings3.slice(0, secondParentHomeIndex),
      secondParent,
      ...siblings3.slice(secondParentHomeIndex),
    ]
    const thirdParentIndex = Math.floor(secondParentIndex / POSEIDON_INPUTS)

    if (parent !== poseidon_raw(thirdChildren) || parentIndex !== thirdParentIndex) {
      throw new Error('verifyMerkleProof failed')
    }
    return []
  }
}
