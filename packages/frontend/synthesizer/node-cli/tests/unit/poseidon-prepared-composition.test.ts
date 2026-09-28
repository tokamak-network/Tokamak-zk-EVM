import { describe, expect, it, vi } from 'vitest';

import { createPoseidonCompositionMapping } from '../../../core/src/subcircuit/special-builders/poseidonComposition.ts';
import { DataPtFactory } from '../../../core/src/synthesizer/dataStructure/dataPt.ts';
import { PlacementManager } from '../../../core/src/synthesizer/runtime/placementManager.ts';
import {
  UINT256_DATA_PT_TYPE,
  UINT32_DATA_PT_TYPE,
  type DataPt,
  type DataPtType,
} from '../../../core/src/synthesizer/types/dataStructure.ts';

const poseidonComposition = createPoseidonCompositionMapping({ nPoseidonBatch: 4 }).composition

const logicalInterface = {
  inputs: [
    { name: 'selector', logicalType: { kind: 'uint' as const, bits: 32 } },
    ...Array.from(
      { length: 5 },
      (_, index) => ({ name: `value${index}`, logicalType: { kind: 'uint' as const, bits: 256 } }),
    ),
  ],
  outputs: [{ name: 'result', logicalType: { kind: 'uint' as const, bits: 256 } }],
}

const dataPt = (
  value: bigint,
  source: number,
  wireIndex: number,
  dataPtType: DataPtType = UINT256_DATA_PT_TYPE,
): DataPt => DataPtFactory.create({ source, wireIndex, dataPtType }, value)

const createPlacementManager = (): PlacementManager => {
  let nextStaticWireIndex = 0
  const reservedDataPts = new Map<string, DataPt>()
  return Object.assign(Object.create(PlacementManager.prototype), {
    _placements: Array.from({ length: 6 }, () => ({
      name: 'Poseidon',
      usage: 'test',
      subcircuitId: 0,
      inPts: [],
      outPts: [],
    })),
    _placementCompositionMapping: { Poseidon: poseidonComposition },
    subcircuitInfoByName: new Map([['Poseidon', {
      id: 0,
      name: 'Poseidon',
      NWires: 13,
      NInWires: 11,
      NOutWires: 2,
      inWireIndex: 3,
      outWireIndex: 1,
      logicalInterface,
    }]]),
    subcircuitLibrary: {
      calculateSubcircuitOutputValues: vi.fn((_: string, values: bigint[]) => [
        values.reduce((sum, value) => sum + value, 0n),
      ]),
    },
    allocateEVMInDataPt: vi.fn((value: bigint, dataPtType: DataPtType) =>
      dataPt(value, 5, nextStaticWireIndex++, dataPtType)),
    getReservedInputBufferDataPt: vi.fn((name: string) => {
      const existing = reservedDataPts.get(name)
      if (existing !== undefined) {
        return DataPtFactory.deepCopy(existing)
      }
      const exponent = /^UINT32_POW2_(\d)$/.exec(name)?.[1]
      const reserved = dataPt(
        exponent === undefined ? 0n : 1n << BigInt(exponent),
        5,
        nextStaticWireIndex++,
        exponent === undefined ? UINT256_DATA_PT_TYPE : UINT32_DATA_PT_TYPE,
      )
      reservedDataPts.set(name, reserved)
      return DataPtFactory.deepCopy(reserved)
    }),
  }) as PlacementManager
}

describe('atomic Poseidon composition', () => {
  it('pads each dynamic batch and connects a prefix hash to the next batch', () => {
    const operands = Array.from(
      { length: 7 },
      (_, index) => dataPt(BigInt(index + 1), 0, index),
    )
    const placementManager = createPlacementManager()
    const resultPts = placementManager.placeComposition('Poseidon', operands)
    const steps = placementManager.placements.slice(6)

    expect(steps).toHaveLength(2)
    expect(steps[0]!.inPts.map(({ value }) => value)).toEqual([8n, 1n, 2n, 3n, 4n, 5n])
    expect(steps[1]!.inPts.map(({ value }) => value)).toEqual([2n, 23n, 6n, 7n, 0n, 0n])
    expect(steps[1]!.inPts[1]).toMatchObject({ source: 6, wireIndex: 0 })
    expect(steps[1]!.outPts[0]).toMatchObject({
      source: 7,
      wireIndex: 0,
      dataPtType: UINT256_DATA_PT_TYPE,
      value: 38n,
    })
    expect(resultPts).toEqual(steps[1]!.outPts)
  })

  it('pads an empty request to the primitive minimum of two inputs', () => {
    const placementManager = createPlacementManager()

    placementManager.placeComposition('Poseidon', [])
    const steps = placementManager.placements.slice(6)

    expect(steps).toHaveLength(1)
    expect(steps[0]!.inPts.map(({ value }) => value)).toEqual([1n, 0n, 0n, 0n, 0n, 0n])
  })

  it('reuses one reserved input wire for equal Poseidon input counts', () => {
    const placementManager = createPlacementManager()

    placementManager.placeComposition('Poseidon', [dataPt(1n, 0, 0), dataPt(2n, 0, 1)])
    placementManager.placeComposition('Poseidon', [dataPt(3n, 0, 2), dataPt(4n, 0, 3)])
    const steps = placementManager.placements.slice(6)

    expect(steps).toHaveLength(2)
    expect(steps[0]!.inPts[0]).toMatchObject({ value: 1n, dataPtType: UINT32_DATA_PT_TYPE })
    expect(steps[1]!.inPts[0]).toMatchObject({
      source: steps[0]!.inPts[0]!.source,
      wireIndex: steps[0]!.inPts[0]!.wireIndex,
      value: 1n,
      dataPtType: UINT32_DATA_PT_TYPE,
    })
  })

  it('rejects view-grouped operands without recording a placement', () => {
    const placementManager = createPlacementManager()

    expect(() => placementManager.placeComposition('Poseidon', [[dataPt(1n, 0, 0)]])).toThrow(
      'Poseidon requires flat operands',
    )
    expect(placementManager.placements).toHaveLength(6)
  })
})
