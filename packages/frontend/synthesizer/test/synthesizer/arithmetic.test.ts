import { describe, expect, it } from 'vitest'

import { ArithmeticOperations } from '../../src/tokamak/operations/arithmetic.js'

describe('ArithmeticOperations', () => {
  it('should handle SLT operation correctly', () => {
    expect(ArithmeticOperations.slt(-3n, -5n)).toBe(0n)
    expect(ArithmeticOperations.slt(-5n, -3n)).toBe(1n)
    expect(ArithmeticOperations.slt(-1n, 1n)).toBe(1n)
  })

  it('should handle SGT operation correctly', () => {
    expect(ArithmeticOperations.sgt(-3n, -5n)).toBe(1n)
    expect(ArithmeticOperations.sgt(-5n, -3n)).toBe(0n)
    expect(ArithmeticOperations.sgt(1n, -1n)).toBe(1n)
  })
})
