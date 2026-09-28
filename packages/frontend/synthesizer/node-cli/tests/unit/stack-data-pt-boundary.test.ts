import { describe, expect, it } from 'vitest';

import { DataPtFactory } from '../../../core/src/synthesizer/dataStructure/dataPt.ts';
import { StackPt } from '../../../core/src/synthesizer/dataStructure/stackPt.ts';
import {
  BIT_DATA_PT_TYPE,
  BLS12_381_FR_DATA_PT_TYPE,
  DATA_PT_TYPE_LIST,
  UINT160_DATA_PT_TYPE,
  UINT256_DATA_PT_TYPE,
  type DataPtType,
} from '../../../core/src/synthesizer/types/dataStructure.ts';

const dataPt = (value: bigint, dataPtType: DataPtType, source = 7, wireIndex = 3) =>
  DataPtFactory.create(
    {
      source,
      wireIndex,
      dataPtType,
      extSource: 'test source',
      extDest: 'test destination',
    },
    value,
  );

describe('EVM stack DataPt boundary', () => {
  it('exports the configured canonical DataPt types', () => {
    expect(DATA_PT_TYPE_LIST).toEqual([
      BIT_DATA_PT_TYPE,
      'uint32',
      'uint128',
      UINT160_DATA_PT_TYPE,
      UINT256_DATA_PT_TYPE,
      BLS12_381_FR_DATA_PT_TYPE,
      'jubjub-scalar',
    ])
  })

  it('copies an EVM-word view without changing its source or value', () => {
    const original = dataPt(0x1234n, UINT256_DATA_PT_TYPE)

    const wordPt = DataPtFactory.copyEvmWord(original)

    expect(wordPt).toMatchObject({
      source: original.source,
      wireIndex: original.wireIndex,
      value: original.value,
      extSource: original.extSource,
      extDest: original.extDest,
      dataPtType: UINT256_DATA_PT_TYPE,
    })
    expect(wordPt).not.toBe(original)
  })

  it.each([
    ['one-limb integer', BIT_DATA_PT_TYPE],
    ['address', UINT160_DATA_PT_TYPE],
    ['native field value', BLS12_381_FR_DATA_PT_TYPE],
  ] as const)('rejects a %s at the EVM-word boundary', (_label, dataPtType) => {
    expect(() => DataPtFactory.copyEvmWord(dataPt(1n, dataPtType))).toThrow(
      'EVM word views require a uint256 data point',
    )
  })

  it('stores only EVM words and routes dup through push', () => {
    const stack = new StackPt()
    const wordPt = dataPt(0x5678n, UINT256_DATA_PT_TYPE, 9, 4)

    stack.push(wordPt)
    stack.dup(1)

    const [duplicate, original] = stack.peek(2)
    expect(duplicate).toEqual(original)
    expect(duplicate).not.toBe(original)
    expect(original).not.toBe(wordPt)
    expect(duplicate.dataPtType).toBe(UINT256_DATA_PT_TYPE)
  })

  it('rejects native and non-word values through StackPt.push', () => {
    const stack = new StackPt()

    expect(() => stack.push(dataPt(1n, BLS12_381_FR_DATA_PT_TYPE))).toThrow(
      'EVM word views require a uint256 data point',
    )
    expect(() => stack.push(dataPt(1n, BIT_DATA_PT_TYPE))).toThrow(
      'EVM word views require a uint256 data point',
    )
    expect(stack.length).toBe(0)
  })
})
