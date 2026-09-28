import { describe, expect, it } from 'vitest'

import { calculateSubcircuitOutputValues } from '../../../core/src/subcircuit/subcircuitOutputOperations.ts'

describe('subcircuit output operations', () => {
  it.each([
    ['ADD', [1n, 2n], [3n]],
    ['MUL', [3n, 7n], [21n]],
    ['SUB', [0n, 1n], [(1n << 256n) - 1n]],
    ['NOT', [0n], [(1n << 256n) - 1n]],
    ['EQ', [5n, 5n], [1n]],
    ['ISZERO', [0n], [1n]],
    ['LT', [1n, 2n], [1n]],
    ['GT', [2n, 1n], [1n]],
    ['SLT', [1n << 255n, 1n], [1n]],
    ['SGT', [1n, 1n << 255n], [1n]],
    ['AND', [0b1100n, 0b1010n], [0b1000n]],
    ['OR', [0b1100n, 0b1010n], [0b1110n]],
    ['XOR', [0b1100n, 0b1010n], [0b0110n]],
    ['SHR', [256n, (1n << 256n) - 1n], [0n]],
  ] as const)('calculates selector-free %s outputs', (name, values, expected) => {
    expect(calculateSubcircuitOutputValues(name, [...values])).toEqual(expected)
  })

  it('returns no host outputs for StorageAccess', () => {
    expect(calculateSubcircuitOutputValues('StorageAccess', [1n, 2n, 1n, 2n])).toEqual([])
  })

  it('calculates the full-word EXP remainder transition', () => {
    const remainder = (1n << 128n) + 3n
    expect(calculateSubcircuitOutputValues('SubExp', [1n, 7n, remainder])).toEqual([
      7n,
      49n,
      remainder >> 1n,
    ])
    expect(calculateSubcircuitOutputValues('AssertZeroWord', [0n])).toEqual([])
  })

  it('calculates each MemoryViewStep output from its encoded inputs', () => {
    expect(calculateSubcircuitOutputValues('MemoryViewStep', [
      0xdeadbeefn,
      1n,
      2n,
      1n,
      1n,
    ])).toEqual([0xef01n, 3n])
    expect(calculateSubcircuitOutputValues('MemoryViewStep', [
      0xdeadbeef00n,
      33n,
      1n,
      0x10000n,
      1n,
    ])).toEqual([0x100efn, 2n])
  })
})
