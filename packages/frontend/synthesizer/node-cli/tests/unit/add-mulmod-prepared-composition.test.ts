import { describe, expect, it, vi } from 'vitest';

import { createAddMulModCompositionMappings } from '../../../core/src/subcircuit/special-builders/addMulModComposition.ts';
import { createDivisionCompositionMappings } from '../../../core/src/subcircuit/special-builders/divModComposition.ts';
import { createExpCompositionMapping } from '../../../core/src/subcircuit/special-builders/expComposition.ts';
import { DataPtFactory } from '../../../core/src/synthesizer/dataStructure/dataPt.ts';
import { PlacementManager } from '../../../core/src/synthesizer/runtime/placementManager.ts';
import {
  BIT_DATA_PT_TYPE,
  UINT128_DATA_PT_TYPE,
  UINT256_DATA_PT_TYPE,
  UINT32_DATA_PT_TYPE,
  type DataPt,
  type DataPtType,
} from '../../../core/src/synthesizer/types/dataStructure.ts';

type FixedMultiStepOperation =
  | 'DIV'
  | 'SDIV'
  | 'MOD'
  | 'SMOD'
  | 'ADDMOD'
  | 'MULMOD'
  | 'EXP'

const uint = (bits: number) => ({ kind: 'uint' as const, bits })

const ports = (bits: readonly number[], prefix: string) => bits.map((bitSize, index) => ({
  name: `${prefix}${index}`,
  logicalType: uint(bitSize),
}))

const wireCount = (bits: readonly number[]) => bits.reduce(
  (count, bitSize) => count + (bitSize === 256 ? 2 : 1),
  0,
)

const subcircuitInfo = (
  name: string,
  inputBits: readonly number[],
  outputBits: readonly number[],
) => ({
  id: 0,
  name,
  NWires: 1 + wireCount(inputBits) + wireCount(outputBits),
  NInWires: wireCount(inputBits),
  NOutWires: wireCount(outputBits),
  inWireIndex: 1 + wireCount(outputBits),
  outWireIndex: 1,
  logicalInterface: {
    inputs: ports(inputBits, 'in'),
    outputs: ports(outputBits, 'out'),
  },
})

const subcircuitInfoByName = new Map([
  ['ADDMODPrepare', subcircuitInfo('ADDMODPrepare', [256, 256, 256], [86, 86, 85, 86, 86, 85, 256])],
  ['ADDMODVerify', subcircuitInfo('ADDMODVerify', [86, 86, 85, 256, 86, 86, 85, 256], [256])],
  ['MULMODPrepare', subcircuitInfo('MULMODPrepare', [256, 256, 256], [...Array(12).fill(64), 256, 256, 256])],
  ['MULMODCandidate', subcircuitInfo('MULMODCandidate', [256, 256, 256], Array(12).fill(64))],
  ['MULMODVerify', subcircuitInfo('MULMODVerify', Array(24).fill(64), [256])],
  ['ALU4A', subcircuitInfo('ALU4A', [32, 256, 256], [256, 256, 256, 64, 64, 64, 64, 1, 1, 1])],
  ['ALU4B', subcircuitInfo('ALU4B', [256, 256, 256, 64, 64, 64, 64, 1, 1, 1], [256])],
  ['AssertZeroWord', subcircuitInfo('AssertZeroWord', [256], [])],
  ['SubExp', subcircuitInfo('SubExp', [256, 256, 256], [256, 256, 256])],
  ['CheckBus256', subcircuitInfo('CheckBus256', [256], [])],
])

const dataPt = (
  value: bigint,
  source: number,
  wireIndex = 0,
  dataPtType: DataPtType = UINT256_DATA_PT_TYPE,
): DataPt => DataPtFactory.create({ source, wireIndex, dataPtType }, value)

const fixedMultiStepCompositions = new Map(
  [
    ...createAddMulModCompositionMappings(),
    ...createDivisionCompositionMappings(),
    createExpCompositionMapping(),
  ].map(({ operation, composition }) => [operation, composition]),
)

const submit = (
  operation: FixedMultiStepOperation,
): { manager: PlacementManager; placements: PlacementManager['placements']; resultPts: readonly DataPt[] } => {
  const calculateSubcircuitOutputValues = vi.fn((name: string): bigint[] => {
    switch (name) {
      case 'ADDMODPrepare':
        return Array.from({ length: 7 }, (_, index) => BigInt(index))
      case 'ADDMODVerify':
        return [7n]
      case 'MULMODPrepare':
        return Array.from({ length: 15 }, (_, index) => BigInt(index))
      case 'MULMODCandidate':
        return Array.from({ length: 12 }, (_, index) => BigInt(index))
      case 'MULMODVerify':
        return [11n]
      case 'ALU4A':
        return [0n, 1n, 2n, 3n, 4n, 5n, 6n, 0n, 1n, 0n]
      case 'ALU4B':
        return [13n]
      case 'SubExp':
        return [17n, 19n, 23n]
      case 'AssertZeroWord':
        return []
      case 'CheckBus256':
        return []
      default:
        throw new Error(`Unexpected subcircuit ${name}`)
    }
  })
  let nextStaticWireIndex = 0
  const parent = Object.assign(Object.create(PlacementManager.prototype), {
    _placements: Array.from({ length: 6 }, () => ({
      name: 'ALU3',
      usage: 'test',
      subcircuitId: 0,
      inPts: [],
      outPts: [],
    })),
    _placementCompositionMapping: Object.fromEntries(fixedMultiStepCompositions),
    _bufferSubcircuitByBuffer: { EVM_IN: { id: 0 } },
    _guardedBufferOutputWires: new Map(),
    subcircuitInfoByName,
    subcircuitLibrary: {
      calculateSubcircuitOutputValues,
    },
    allocateEVMInDataPt: vi.fn((value: bigint, dataPtType: DataPtType) =>
      dataPt(value, 5, nextStaticWireIndex++, dataPtType)),
    getReservedInputBufferDataPt: vi.fn((name: string) => {
      const exponent = /^UINT32_POW2_(\d)$/.exec(name)?.[1]
      return dataPt(
        name.endsWith('_ONE') ? 1n : exponent === undefined ? 0n : 1n << BigInt(exponent),
        5,
        nextStaticWireIndex++,
        name.startsWith('BIT_')
          ? BIT_DATA_PT_TYPE
          : exponent === undefined ? UINT256_DATA_PT_TYPE : UINT32_DATA_PT_TYPE,
      )
    }),
  }) as PlacementManager
  const resultPts = parent.placeComposition(
    operation,
    operation === 'ADDMOD' || operation === 'MULMOD'
      ? [dataPt(3n, 0), dataPt(4n, 1), dataPt(5n, 2)]
      : [dataPt(3n, 0), dataPt(4n, 1)],
  )

  return {
    manager: parent,
    placements: parent.placements.slice(6),
    resultPts,
  }
}

describe('fixed generic atomic compositions', () => {
  it('prepares every declared result of a fixed generic composition', () => {
    const composition = {
      placementStrategy: 'generic' as const,
      constants: [],
      canonicalityGuardOperandIndices: [],
      numSteps: 1,
      numOperands: 1,
      numResults: 3,
      steps: [{
        subcircuit: 'ALU3' as const,
        selector: null,
        inputs: [{ kind: 'operand' as const, index: 0 }],
        outputs: [
          { kind: 'result' as const, index: 0 },
          { kind: 'result' as const, index: 1 },
          { kind: 'result' as const, index: 2 },
        ],
      }],
    }
    const parent = Object.assign(Object.create(PlacementManager.prototype), {
      _placements: Array.from({ length: 4 }, () => ({
        name: 'ALU3', usage: 'test', subcircuitId: 0, inPts: [], outPts: [],
      })),
      _placementCompositionMapping: { ADDMOD: composition },
      subcircuitInfoByName: new Map([['ALU3', subcircuitInfo('ALU3', [256], [1, 32, 256])]]),
      subcircuitLibrary: {
        calculateSubcircuitOutputValues: () => [1n, 2n, 3n],
      },
      allocateEVMInDataPt: vi.fn(),
    }) as PlacementManager

    const resultPts = parent.placeComposition('ADDMOD', [dataPt(7n, 0)])

    expect(resultPts).toMatchObject([
      { source: 4, wireIndex: 0, value: 1n, dataPtType: BIT_DATA_PT_TYPE },
      { source: 4, wireIndex: 1, value: 2n, dataPtType: UINT32_DATA_PT_TYPE },
      { source: 4, wireIndex: 2, value: 3n, dataPtType: UINT256_DATA_PT_TYPE },
    ])
  })

  it('prepares the two ADDMOD steps with typed intermediate outputs', () => {
    const { placements, resultPts } = submit('ADDMOD')

    expect(placements.map((step) => [step.inPts.length, step.outPts.length]))
      .toEqual([[3, 7], [8, 1]])
    expect(placements[0]!.outPts.map(({ dataPtType }) => dataPtType)).toEqual([
      UINT128_DATA_PT_TYPE,
      UINT128_DATA_PT_TYPE,
      UINT128_DATA_PT_TYPE,
      UINT128_DATA_PT_TYPE,
      UINT128_DATA_PT_TYPE,
      UINT128_DATA_PT_TYPE,
      UINT256_DATA_PT_TYPE,
    ])
    expect(placements[1]!.inPts[0]).toMatchObject({ source: 6, wireIndex: 0 })
    expect(placements[1]!.inPts[3]).toMatchObject({ source: 2, wireIndex: 0 })
    expect(resultPts).toMatchObject([{ source: 7, wireIndex: 0, value: 7n }])
  })

  it('prepares the three MULMOD steps with every intermediate connected by wire', () => {
    const { placements, resultPts } = submit('MULMOD')

    expect(placements.map((step) => [step.inPts.length, step.outPts.length]))
      .toEqual([[3, 15], [3, 12], [24, 1]])
    expect(placements[1]!.inPts.map(({ source, wireIndex }) => [source, wireIndex]))
      .toEqual([[6, 12], [6, 13], [6, 14]])
    expect(placements[2]!.inPts.slice(0, 12).map(({ source }) => source))
      .toEqual(Array(12).fill(6))
    expect(placements[2]!.inPts.slice(12).map(({ source }) => source))
      .toEqual(Array(12).fill(7))
    expect(resultPts).toMatchObject([{ source: 8, wireIndex: 0, value: 11n }])
  })

  it('prepares the division-family steps with a selector and typed flags', () => {
    const { placements, resultPts } = submit('DIV')

    expect(placements.map((step) => [step.inPts.length, step.outPts.length]))
      .toEqual([[3, 10], [10, 1]])
    expect(placements[0]!.inPts[0]).toMatchObject({
      source: 5,
      value: 1n << 3n,
      dataPtType: UINT32_DATA_PT_TYPE,
    })
    expect(placements[0]!.outPts.map(({ dataPtType }) => dataPtType)).toEqual([
      UINT256_DATA_PT_TYPE,
      UINT256_DATA_PT_TYPE,
      UINT256_DATA_PT_TYPE,
      UINT128_DATA_PT_TYPE,
      UINT128_DATA_PT_TYPE,
      UINT128_DATA_PT_TYPE,
      UINT128_DATA_PT_TYPE,
      BIT_DATA_PT_TYPE,
      BIT_DATA_PT_TYPE,
      BIT_DATA_PT_TYPE,
    ])
    expect(placements[1]!.inPts.map(({ source }) => source))
      .toEqual(Array(10).fill(6))
    expect(resultPts).toMatchObject([{ source: 7, wireIndex: 0, value: 13n }])
  })

  it('prepares every declared EXP step and preserves the serial state connections', () => {
    const { placements, resultPts } = submit('EXP')

    expect(placements).toHaveLength(259)
    expect(placements[0]).toMatchObject({
      name: 'CheckBus256',
      inPts: [{ source: 1, wireIndex: 0, value: 4n }],
      outPts: [],
    })
    expect(placements[1]!.inPts.map(({ value }) => value)).toEqual([1n, 3n, 4n])
    expect(placements[1]!.outPts).toHaveLength(3)
    expect(placements[2]!.inPts.map(({ source, wireIndex }) => [source, wireIndex]))
      .toEqual([[7, 0], [7, 1], [7, 2]])
    expect(placements[257]).toMatchObject({
      name: 'AssertZeroWord',
      inPts: [{ source: 262, wireIndex: 2, value: 23n }],
      outPts: [],
    })
    expect(placements.at(-1)).toMatchObject({
      inPts: [{ source: 262, wireIndex: 0, value: 17n }],
      outPts: [],
    })
    expect(resultPts).toMatchObject([{ source: 262, wireIndex: 0, value: 17n }])
  })

  it('reuses the EXP exponent guard for the exact previously guarded buffer wire', () => {
    const { manager } = submit('EXP')
    const placementCountBeforeReuse = manager.placements.length

    manager.placeComposition('EXP', [dataPt(3n, 0), dataPt(4n, 1)])

    const reusedPlacements = manager.placements.slice(placementCountBeforeReuse)
    expect(reusedPlacements).toHaveLength(258)
    expect(reusedPlacements[0]).toMatchObject({ name: 'SubExp' })
    expect(reusedPlacements.some(({ name }) => name === 'CheckBus256')).toBe(true)
    expect(reusedPlacements.at(-1)).toMatchObject({ name: 'CheckBus256' })
  })
})
