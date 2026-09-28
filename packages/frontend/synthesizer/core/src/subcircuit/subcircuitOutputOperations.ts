import { jubjub } from '@noble/curves/misc.js';
import { poseidon_raw, poseidonChainCompress } from 'tokamak-l2js';

import type { CompositionSubcircuit } from './configuredTypes.ts';

type Affine = readonly [bigint, bigint];
type Extended = readonly [bigint, bigint, bigint, bigint];

const Q = jubjub.Point.Fp.ORDER;
const D = jubjub.CURVE.d;
const G8: Affine = (() => {
  const { x, y } = jubjub.Point.BASE.multiply(jubjub.CURVE.h).toAffine();
  return [x, y];
})();
const EVM_WORD_MODULUS = 1n << 256n;
const MAX_UINT256 = EVM_WORD_MODULUS - 1n;

const mod = (value: bigint): bigint => {
  const remainder = value % Q;
  return remainder < 0n ? remainder + Q : remainder;
};

const mul = (left: bigint, right: bigint): bigint => mod(left * right);

const inverse = (value: bigint, description: string): bigint => {
  let base = mod(value);
  if (base === 0n) throw new Error(`TransactionSignature: ${description} is zero`);
  let exponent = Q - 2n;
  let result = 1n;
  while (exponent > 0n) {
    if ((exponent & 1n) === 1n) result = mul(result, base);
    base = mul(base, base);
    exponent >>= 1n;
  }
  return result;
};

const expectLength = (values: readonly bigint[], expected: number, name: string): void => {
  if (values.length !== expected) {
    throw new Error(`TransactionSignature: ${name} expected ${expected} inputs, but got ${values.length}`);
  }
};

const expectBit = (value: bigint, description: string): void => {
  if (value !== 0n && value !== 1n) throw new Error(`TransactionSignature: ${description} is not a bit`);
};

const expectFr = (value: bigint, description: string): void => {
  if (value < 0n || value >= Q) {
    throw new Error(`TransactionSignature: ${description} is not a canonical BLS12-381 Fr value`);
  }
};

const toBits = (value: bigint, width: number, description: string): bigint[] => {
  if (value < 0n || value >= 1n << BigInt(width)) {
    throw new Error(`TransactionSignature: ${description} does not fit in ${width} bits`);
  }
  return Array.from({ length: width }, (_, index) => (value >> BigInt(index)) & 1n);
};

const expectPoint = (point: Affine, description: string): void => {
  expectFr(point[0], `${description}.x`);
  expectFr(point[1], `${description}.y`);
  const x2 = mul(point[0], point[0]);
  const y2 = mul(point[1], point[1]);
  if (mod(-x2 + y2) !== mod(1n + mul(D, mul(x2, y2)))) {
    throw new Error(`TransactionSignature: ${description} is not a Jubjub point`);
  }
};

const affineAdd = (left: Affine, right: Affine): Affine => {
  const xProduct = mul(left[0], right[0]);
  const yProduct = mul(left[1], right[1]);
  const denominatorTerm = mul(D, mul(xProduct, yProduct));
  const numeratorX = mod(mul(left[0] + left[1], right[0] + right[1]) - xProduct - yProduct);
  return [
    mul(numeratorX, inverse(1n + denominatorTerm, 'affine x denominator')),
    mul(yProduct + xProduct, inverse(1n - denominatorTerm, 'affine y denominator')),
  ];
};

const double = (point: readonly [bigint, bigint, bigint], includeT: boolean): readonly bigint[] => {
  const a = mul(point[0], point[0]);
  const b = mul(point[1], point[1]);
  const c = mul(2n, mul(point[2], point[2]));
  const e = mod(mul(point[0] + point[1], point[0] + point[1]) - a - b);
  const xFactor = mod(-a + b - c);
  const yFactor = mod(-a + b);
  const result = [mul(e, xFactor), mul(yFactor, -a - b), mul(xFactor, yFactor)];
  if (includeT) result.push(mul(e, -a - b));
  return result;
};

const addAffineWithT = (
  point: Extended,
  affine: readonly [bigint, bigint, bigint],
  includeT: boolean,
): readonly bigint[] => {
  const a = mul(point[1] - point[0], affine[1] - affine[0]);
  const b = mul(point[1] + point[0], affine[1] + affine[0]);
  const c = mul(2n * D, mul(point[3], affine[2]));
  const xFactor = mod(2n * point[2] - c);
  const yFactor = mod(2n * point[2] + c);
  const result = [mul(b - a, xFactor), mul(yFactor, b + a), mul(xFactor, yFactor)];
  if (includeT) result.push(mul(b - a, b + a));
  return result;
};

const addAffine = (point: Extended, affine: Affine): Extended =>
  addAffineWithT(point, [affine[0], affine[1], mul(affine[0], affine[1])], true) as Extended;

const addExtended = (left: Extended, right: Extended): readonly [bigint, bigint, bigint] => {
  const a = mul(left[1] - left[0], right[1] - right[0]);
  const b = mul(left[1] + left[0], right[1] + right[0]);
  const c = mul(2n * D, mul(left[3], right[3]));
  const d = mul(2n, mul(left[2], right[2]));
  return [mul(b - a, d - c), mul(d + c, b + a), mul(d - c, d + c)];
};

const toAffine = (point: readonly [bigint, bigint, bigint]): Affine => [
  mul(point[0], inverse(point[2], 'extended point z coordinate')),
  mul(point[1], inverse(point[2], 'extended point z coordinate')),
];

const cofactorEight = (point: Affine, includeT: boolean): readonly bigint[] => {
  const point2 = double([point[0], point[1], 1n], false) as readonly [bigint, bigint, bigint];
  const point4 = double(point2, false) as readonly [bigint, bigint, bigint];
  return double(point4, includeT);
};

const fixedBatch = (
  scalarBits: readonly bigint[],
  previous: Extended,
  startWindow: number,
  includeT: boolean,
): readonly bigint[] => {
  if (scalarBits.length % 3 !== 0) throw new Error('TransactionSignature: fixed-window bit count is invalid');
  scalarBits.forEach((bit, index) => expectBit(bit, `fixed-window bit ${index}`));
  let base = G8;
  for (let bit = 0; bit < startWindow * 3; bit++) base = affineAdd(base, base);
  let accumulator = previous;
  const numWindows = scalarBits.length / 3;
  for (let window = 0; window < numWindows; window++) {
    const table: Affine[] = [[0n, 1n]];
    for (let digit = 1; digit < 8; digit++) table.push(affineAdd(table[digit - 1]!, base));
    const digit = Number(scalarBits[3 * window]! + 2n * scalarBits[3 * window + 1]! + 4n * scalarBits[3 * window + 2]!);
    accumulator = addAffineWithT(
      accumulator,
      [table[digit]![0], table[digit]![1], mul(table[digit]![0], table[digit]![1])],
      window + 1 === numWindows ? includeT : true,
    ) as Extended;
    for (let bit = 0; bit < 3; bit++) base = affineAdd(base, base);
  }
  return accumulator;
};

const variableBatch = (
  scalarBits: readonly bigint[],
  table: readonly Affine[],
  previous: Extended,
  topPadding: boolean,
  first: boolean,
): Extended => {
  if (table.length !== 4) throw new Error('TransactionSignature: variable-window table must contain four points');
  scalarBits.forEach((bit, index) => expectBit(bit, `variable-window bit ${index}`));
  const windows = topPadding ? (scalarBits.length + 1) / 2 : scalarBits.length / 2;
  if (!Number.isInteger(windows) || windows <= 0)
    throw new Error('TransactionSignature: variable-window bit count is invalid');
  let accumulator = previous;
  for (let step = 0; step < windows; step++) {
    const start = scalarBits.length - 2 * (step + 1) + (topPadding ? 1 : 0);
    const low = topPadding && step === 0 ? scalarBits[scalarBits.length - 1]! : scalarBits[start]!;
    const high = topPadding && step === 0 ? 0n : scalarBits[start + 1]!;
    if (!(first && step === 0)) {
      const firstDouble = double([accumulator[0], accumulator[1], accumulator[2]], false) as readonly [
        bigint,
        bigint,
        bigint,
      ];
      accumulator = double(firstDouble, true) as Extended;
    }
    accumulator = addAffine(accumulator, table[Number(low + 2n * high)]!);
  }
  return accumulator;
};

const expectExtendedEqual = (
  left: readonly [bigint, bigint, bigint],
  right: readonly [bigint, bigint, bigint],
): void => {
  const scale = mul(left[2], inverse(right[2], 'extended equality right z coordinate'));
  for (let coordinate = 0; coordinate < 3; coordinate++) {
    if (left[coordinate] !== mul(scale, right[coordinate])) {
      throw new Error('TransactionSignature: terminal extended points are not equal');
    }
  }
};

const convertToSigned = (value: bigint): bigint => {
  const SIGN_BIT = 1n << 255n;
  return (value & SIGN_BIT) !== 0n ? value - (1n << 256n) : value;
};
const requireSubcircuitInputs = (inVals: bigint[], expectedLength: number, subcircuit: string): void => {
  if (inVals.length !== expectedLength) {
    throw new Error(`${subcircuit} expected ${expectedLength} inputs, but got ${inVals.length}`);
  }
};

/**
 * Basic arithmetic operations
 */
const evmAdd = (ins: bigint[]): bigint => {
  if (ins.length !== 2) {
    throw new Error('add expected two inputs');
  }
  return (ins[0] + ins[1]) & MAX_UINT256;
};

const evmMul = (ins: bigint[]): bigint => {
  if (ins.length !== 2) {
    throw new Error('mul expected two inputs');
  }
  return (ins[0] * ins[1]) & MAX_UINT256;
};

const evmSub = (ins: bigint[]): bigint => {
  if (ins.length !== 2) {
    throw new Error('sub expected two inputs');
  }
  return (ins[0] - ins[1]) & MAX_UINT256;
};

/**
 * Comparison operations
 */
const evmLt = (ins: bigint[]): bigint => {
  if (ins.length !== 2) {
    throw new Error('lt expected two inputs');
  }
  return ins[0] < ins[1] ? 1n : 0n;
};

const evmGt = (ins: bigint[]): bigint => {
  if (ins.length !== 2) {
    throw new Error('gt expected two inputs');
  }
  return ins[0] > ins[1] ? 1n : 0n;
};

const evmSlt = (ins: bigint[]): bigint => {
  if (ins.length !== 2) {
    throw new Error('slt expected two inputs');
  }
  return convertToSigned(ins[0]) < convertToSigned(ins[1]) ? 1n : 0n;
};

const evmSgt = (ins: bigint[]): bigint => {
  if (ins.length !== 2) {
    throw new Error('sgt expected two inputs');
  }
  return convertToSigned(ins[0]) > convertToSigned(ins[1]) ? 1n : 0n;
};

const evmEq = (ins: bigint[]): bigint => {
  if (ins.length !== 2) {
    throw new Error('eq expected two inputs');
  }
  return ins[0] === ins[1] ? 1n : 0n;
};

const evmIszero = (ins: bigint[]): bigint => {
  if (ins.length !== 1) {
    throw new Error('iszero expected one input');
  }
  return ins[0] === 0n ? 1n : 0n;
};

/**
 * Bit operations
 */
const evmAnd = (ins: bigint[]): bigint => {
  if (ins.length !== 2) {
    throw new Error('and expected two inputs');
  }
  return ins[0] & ins[1];
};

const evmOr = (ins: bigint[]): bigint => {
  if (ins.length !== 2) {
    throw new Error('or expected two inputs');
  }
  return ins[0] | ins[1];
};

const evmXor = (ins: bigint[]): bigint => {
  if (ins.length !== 2) {
    throw new Error('xor expected two inputs');
  }
  return ins[0] ^ ins[1];
};

const evmNot = (ins: bigint[]): bigint => {
  if (ins.length !== 1) {
    throw new Error('not expected one input');
  }
  return ~ins[0] & MAX_UINT256;
};

/**
 * Shift operations
 */
const evmShl = (ins: bigint[]): bigint => {
  if (ins.length !== 2) {
    throw new Error('shl expected two inputs');
  }
  const shift = ins[0];
  const value = ins[1];
  return shift >= 256n ? 0n : (value << shift) & MAX_UINT256;
};

const evmShr = (ins: bigint[]): bigint => {
  if (ins.length !== 2) {
    throw new Error('shr expected two inputs');
  }
  const shift = ins[0];
  const value = ins[1];
  return shift >= 256n ? 0n : value >> shift;
};

const evmSar = (ins: bigint[]): bigint => {
  if (ins.length !== 2) {
    throw new Error('sar expected two inputs');
  }
  const shift = ins[0];
  const value = ins[1];
  if (shift >= 256n) {
    return (value & (1n << 255n)) === 0n ? 0n : MAX_UINT256;
  }

  const isNegative = (value & (1n << 255n)) !== 0n;
  if (isNegative) {
    const mask = MAX_UINT256 << (256n - shift);
    // Apply the mask to the shifted value and ensure the result is within 256 bits
    return BigInt.asUintN(256, (value >> shift) | mask);
  }
  // For non-negative values, simply shift right
  return value >> shift;
};

/**
 * Byte operations
 */
const evmByte = (ins: bigint[]): bigint => {
  if (ins.length !== 2) {
    throw new Error('byte expected two inputs');
  }
  const index = ins[0];
  const value = ins[1];
  if (index >= 32n) return 0n;
  const shiftBits = (31n - index) * 8n;
  return (value >> shiftBits) & 0xffn;
};

/**
 * Sign extension
 */
const evmSignextend = (ins: bigint[]): bigint => {
  if (ins.length !== 2) {
    throw new Error('signextend expected two inputs');
  }
  const k = ins[0];
  const value = ins[1];
  if (k > 31n) return value;

  const bitPos = (k + 1n) * 8n - 1n;
  const signBit = (value >> bitPos) & 1n;

  if (signBit === 1n) {
    const mask = ((1n << (256n - bitPos)) - 1n) << bitPos;
    return value | mask;
  } else {
    const mask = (1n << (bitPos + 1n)) - 1n;
    return value & mask;
  }
};

const alu3 = (inVals: bigint[]): bigint => {
  requireSubcircuitInputs(inVals, 3, 'ALU3');
  const operands = inVals.slice(1);
  switch (inVals[0]) {
    case 1n << 0n:
      return evmSignextend(operands);
    case 1n << 1n:
      return evmByte(operands);
    case 1n << 2n:
      return evmSar(operands);
    default:
      throw new Error('ALU3 received an invalid selector');
  }
};

const alu4a = (inVals: bigint[]): bigint[] => {
  requireSubcircuitInputs(inVals, 3, 'ALU4A');
  const selector = inVals[0];
  const isSigned = selector === 1n << 4n || selector === 1n << 6n;
  const useMod = selector === 1n << 5n || selector === 1n << 6n;
  if (selector !== 1n << 3n && selector !== 1n << 4n && selector !== 1n << 5n && selector !== 1n << 6n) {
    throw new Error('ALU4A received an invalid selector');
  }

  const dividend = isSigned ? BigInt.asIntN(256, inVals[1]) : inVals[1];
  const divisor = isSigned ? BigInt.asIntN(256, inVals[2]) : inVals[2];
  const absDividend = dividend < 0n ? -dividend : dividend;
  const absDivisor = divisor < 0n ? -divisor : divisor;
  const safeDivisor = absDivisor === 0n ? 1n : absDivisor;
  const absQuotient = absDividend / safeDivisor;
  const absRemainder = absDividend % safeDivisor;
  const resultIsNegative =
    selector === 1n << 4n ? Number(dividend < 0n !== divisor < 0n) : selector === 1n << 6n ? Number(dividend < 0n) : 0;
  const wordMask = (1n << 64n) - 1n;

  return [
    absDividend,
    absQuotient,
    absRemainder,
    absDivisor & wordMask,
    (absDivisor >> 64n) & wordMask,
    (absDivisor >> 128n) & wordMask,
    (absDivisor >> 192n) & wordMask,
    absDivisor === 0n ? 1n : 0n,
    BigInt(resultIsNegative),
    useMod ? 1n : 0n,
  ];
};

const alu4b = (inVals: bigint[]): bigint => {
  requireSubcircuitInputs(inVals, 10, 'ALU4B');
  const absQuotient = inVals[1];
  const absRemainder = inVals[2];
  const divisorIsZero = inVals[7];
  const resultIsNegative = inVals[8];
  const useMod = inVals[9];
  if (
    (divisorIsZero !== 0n && divisorIsZero !== 1n) ||
    (resultIsNegative !== 0n && resultIsNegative !== 1n) ||
    (useMod !== 0n && useMod !== 1n)
  ) {
    throw new Error('ALU4B flags must be binary');
  }

  const evmQuotient = divisorIsZero === 1n ? 0n : absQuotient;
  const selectedMagnitude = useMod === 1n ? absRemainder : evmQuotient;
  return resultIsNegative === 1n ? BigInt.asUintN(256, -selectedMagnitude) : selectedMagnitude;
};

const addmodPrepare = (inVals: bigint[]): bigint[] => {
  requireSubcircuitInputs(inVals, 3, 'ADDMODPrepare');
  const [lhs, rhs, modulus] = inVals;
  const wordMask = (1n << 86n) - 1n;
  const numerator = lhs + rhs;
  const safeModulus = modulus === 0n ? 1n : modulus;
  const quotient = numerator / safeModulus;
  const remainder = numerator % safeModulus;
  return [
    numerator & wordMask,
    (numerator >> 86n) & wordMask,
    numerator >> 172n,
    quotient & wordMask,
    (quotient >> 86n) & wordMask,
    quotient >> 172n,
    remainder,
  ];
};

const addmodVerify = (inVals: bigint[]): bigint => {
  requireSubcircuitInputs(inVals, 8, 'ADDMODVerify');
  return inVals[7];
};

const split64Words = (value: bigint, count: number): bigint[] => {
  const wordMask = (1n << 64n) - 1n;
  return Array.from({ length: count }, (_, index) => (value >> BigInt(64 * index)) & wordMask);
};

const mulmodPrepare = (inVals: bigint[]): bigint[] => {
  requireSubcircuitInputs(inVals, 3, 'MULMOD');
  const [lhs, rhs, modulus] = inVals;
  const product = lhs * rhs;
  const safeModulus = modulus === 0n ? 1n : modulus;
  const quotient = product / safeModulus;
  const remainder = product % safeModulus;
  return [
    ...split64Words(lhs, 4),
    ...split64Words(rhs, 4),
    ...split64Words(modulus, 4),
    quotient & MAX_UINT256,
    quotient >> 256n,
    remainder,
  ];
};

const mulmodCandidate = (inVals: bigint[]): bigint[] => {
  requireSubcircuitInputs(inVals, 3, 'MULMODCandidate');
  return inVals.flatMap(value => split64Words(value, 4));
};

const mulmodVerify = (inVals: bigint[]): bigint => {
  requireSubcircuitInputs(inVals, 24, 'MULMODVerify');
  return inVals.slice(20, 24).reduce((value, word, index) => value + (word << BigInt(64 * index)), 0n);
};

/**
 * One LSB-first square-and-multiply step for EXP.
 */
const evmSubExp = (inVals: bigint[]): bigint[] => {
  if (inVals.length !== 3) {
    throw new Error(`subExp expected exactly 3 input values, but got ${inVals.length} values`);
  }
  const [accumulator, basePower, exponentRemainder] = inVals;
  return [
    (accumulator * ((exponentRemainder & 1n) === 1n ? basePower : 1n)) % EVM_WORD_MODULUS,
    (basePower * basePower) % EVM_WORD_MODULUS,
    exponentRemainder >> 1n,
  ];
};

const poseidon = (inVals: bigint[]): bigint => {
  if (inVals.length < 3) {
    throw new Error('Poseidon expected a selector and at least two inputs');
  }
  const selector = inVals[0];
  if (selector <= 0n || (selector & (selector - 1n)) !== 0n) {
    throw new Error('Poseidon received an invalid selector');
  }

  let selectorIndex = 0;
  for (let remaining = selector; remaining > 1n; remaining >>= 1n) {
    selectorIndex++;
  }
  const numInputs = selectorIndex + 2;
  if (numInputs > inVals.length - 1) {
    throw new Error('Poseidon selector exceeds the configured input capacity');
  }
  return poseidonChainCompress(inVals.slice(1, numInputs + 1));
};

const memoryViewStep = (values: readonly bigint[]): bigint[] => {
  expectLength(values, 5, 'MemoryViewStep');
  const [sourceWord, encodedShift, ownership, previousWord, previousOwnership] = values;
  const shiftMagnitude = encodedShift! & 31n;
  const direction = encodedShift! >> 5n;
  const shiftBits = shiftMagnitude! * 8n;
  const shiftedWord = direction === 0n ? sourceWord! << shiftBits : sourceWord! >> shiftBits;
  let ownershipWordMask = 0n;
  for (let byte = 0n; byte < 32n; byte++) {
    if ((ownership! & (1n << byte)) !== 0n) {
      ownershipWordMask |= 0xffn << (8n * byte);
    }
  }
  const nextWord = previousWord! + (shiftedWord & ownershipWordMask);
  if (nextWord >= EVM_WORD_MODULUS) {
    throw new Error('MemoryViewStep: fragment sum exceeds an EVM word');
  }
  const nextOwnership = previousOwnership! + ownership!;
  return [nextWord, nextOwnership];
};

const poseidonBatch4 = (values: readonly bigint[]): bigint[] => {
  expectLength(values, 7, 'TransactionSignaturePoseidonBatch4');
  const [mode, firstLeft, firstRight, independentLeft, secondRight, thirdRight, fourthRight] = values;
  expectBit(mode!, 'Poseidon batch mode');
  const firstHash = poseidon_raw([firstLeft!, firstRight!]);
  const secondHash = poseidon_raw([mode === 1n ? firstHash : independentLeft!, secondRight!]);
  const thirdHash = poseidon_raw([secondHash, thirdRight!]);
  return [firstHash, poseidon_raw([thirdHash, fourthRight!])];
};

const poseidonTail1 = (values: readonly bigint[]): bigint[] => {
  expectLength(values, 4, 'TransactionSignaturePoseidonTail1');
  return [
    poseidon_raw([values[0]!, values[1]!]),
    poseidon_raw([values[2]!, values[3]!]),
  ];
};

const poseidonTail2 = (values: readonly bigint[]): bigint[] => {
  expectLength(values, 5, 'TransactionSignaturePoseidonTail2');
  return [
    poseidon_raw([values[0]!, values[1]!]),
    poseidon_raw([poseidon_raw([values[2]!, values[3]!]), values[4]!]),
  ];
};

const pointPolicy = (values: readonly bigint[]): bigint[] => {
  expectLength(values, 8, 'TransactionSignaturePointPolicy');
  const randomizer: Affine = [values[0]!, values[1]!];
  const publicKey: Affine = [values[2]!, values[3]!];
  const identity: Affine = [values[6]!, values[7]!];
  if (values[4]! < 0n || values[4]! >= 1n << 160n)
    throw new Error('TransactionSignature: contract address does not fit in 160 bits');
  if (values[5]! < 0n || values[5]! >= 1n << 32n)
    throw new Error('TransactionSignature: function selector does not fit in 32 bits');
  expectPoint(randomizer, 'randomizer');
  expectPoint(publicKey, 'public key');
  const cofactoredPublicKey = cofactorEight(publicKey, false) as readonly [bigint, bigint, bigint];
  const publicKeyAffine = toAffine(cofactoredPublicKey);
  if (publicKeyAffine[1] === 1n) throw new Error('TransactionSignature: public key is the identity');
  if (randomizer[1] === 1n) throw new Error('TransactionSignature: randomizer is the identity');
  const table: Affine[] = [identity, publicKeyAffine];
  table.push(affineAdd(table[1]!, publicKeyAffine));
  table.push(affineAdd(table[2]!, publicKeyAffine));
  return [values[5]!, values[4]!, ...table.flat(), ...cofactorEight(randomizer, true)];
};

const pointPolicyWithHash = (values: readonly bigint[]): bigint[] => [
  ...pointPolicy(values),
  poseidon_raw([values[2]!, values[3]!]),
];

const fixedPrefix70 = (values: readonly bigint[]): bigint[] => {
  expectLength(values, 1, 'TransactionSignatureFixedPrefix70');
  const signatureBits = toBits(values[0]!, 252, 'response scalar');
  return [
    signatureBits.slice(210).reduce((value, bit, index) => value + (bit << BigInt(index)), 0n),
    ...fixedBatch(signatureBits.slice(0, 210), [0n, 1n, 1n, 0n], 0, true),
  ];
};

const challengeChunks = (values: readonly bigint[]): bigint[] => {
  expectLength(values, 1, 'TransactionSignatureChallengeChunks');
  expectFr(values[0]!, 'challenge hash');
  const challengeBits = toBits(values[0]!, 255, 'challenge hash');
  return [
    challengeBits.slice(192, 255).reduce((value, bit, index) => value + (bit << BigInt(index)), 0n),
    challengeBits.slice(128, 192).reduce((value, bit, index) => value + (bit << BigInt(index)), 0n),
    challengeBits.slice(64, 128).reduce((value, bit, index) => value + (bit << BigInt(index)), 0n),
    challengeBits.slice(0, 64).reduce((value, bit, index) => value + (bit << BigInt(index)), 0n),
  ];
};

const variableFirstBatch32 = (values: readonly bigint[]): bigint[] => {
  expectLength(values, 9, 'TransactionSignatureVariableFirstBatch32');
  const table = Array.from({ length: 4 }, (_, index): Affine => [values[1 + 2 * index]!, values[2 + 2 * index]!]);
  return [
    ...variableBatch(
      toBits(values[0]!, 63, 'leading challenge chunk'),
      table,
      [table[0]![0], table[0]![1], 1n, 0n],
      true,
      true,
    ),
  ];
};

const variableBatch32 = (values: readonly bigint[]): bigint[] => {
  expectLength(values, 13, 'TransactionSignatureVariableBatch32');
  const table = Array.from({ length: 4 }, (_, index): Affine => [values[1 + 2 * index]!, values[2 + 2 * index]!]);
  return [
    ...variableBatch(
      toBits(values[0]!, 64, 'challenge chunk'),
      table,
      [values[9]!, values[10]!, values[11]!, values[12]!],
      false,
      false,
    ),
  ];
};

const final = (values: readonly bigint[]): bigint[] => {
  expectLength(values, 14, 'TransactionSignatureFinal');
  const fixedTail = fixedBatch(
    toBits(values[0]!, 42, 'remaining response scalar'),
    [values[1]!, values[2]!, values[3]!, values[4]!],
    70,
    false,
  ) as readonly [bigint, bigint, bigint];
  expectExtendedEqual(
    fixedTail,
    addExtended([values[5]!, values[6]!, values[7]!, values[8]!], [values[9]!, values[10]!, values[11]!, values[12]!]),
  );
  expectFr(values[13]!, 'public key hash');
  return [values[13]! & ((1n << 160n) - 1n)];
};

type SubcircuitOperation = (values: bigint[]) => bigint | bigint[];

const SUBCIRCUIT_OPERATION_MAPPING: Partial<Record<CompositionSubcircuit, SubcircuitOperation>> = {
  ALU3: alu3,
  ALU4A: alu4a,
  ALU4B: alu4b,
  SHL: evmShl,
  ADDMODPrepare: addmodPrepare,
  ADDMODVerify: addmodVerify,
  MULMODPrepare: mulmodPrepare,
  MULMODCandidate: mulmodCandidate,
  MULMODVerify: mulmodVerify,
  AssertZeroWord: () => [],
  SubExp: evmSubExp,
  CheckBus256: () => [],
  Poseidon: poseidon,
  MemoryViewStep: memoryViewStep,
  StorageAccess: () => [],
  TransactionSignaturePoseidonBatch4: poseidonBatch4,
  TransactionSignaturePoseidonTail1: poseidonTail1,
  TransactionSignaturePoseidonTail2: poseidonTail2,
  TransactionSignaturePointPolicy: pointPolicy,
  TransactionSignaturePointPolicyWithHash: pointPolicyWithHash,
  TransactionSignatureFixedPrefix70: fixedPrefix70,
  TransactionSignatureChallengeChunks: challengeChunks,
  TransactionSignatureVariableFirstBatch32: variableFirstBatch32,
  TransactionSignatureVariableBatch32: variableBatch32,
  TransactionSignatureFinal: final,
  FrToLimbsPair: values => values,
  ADD: evmAdd,
  MUL: evmMul,
  SUB: evmSub,
  NOT: evmNot,
  EQ: evmEq,
  ISZERO: evmIszero,
  LT: evmLt,
  GT: evmGt,
  SLT: evmSlt,
  SGT: evmSgt,
  AND: evmAnd,
  OR: evmOr,
  XOR: evmXor,
  SHR: evmShr,
};

export function calculateSubcircuitOutputValues(name: CompositionSubcircuit, values: bigint[]): bigint[] {
  const operation = SUBCIRCUIT_OPERATION_MAPPING[name];
  if (operation === undefined) {
    throw new Error(`Synthesizer: ${name} host output calculation is not implemented`);
  }
  const outputValues = operation(values);
  return Array.isArray(outputValues) ? outputValues : [outputValues];
}
