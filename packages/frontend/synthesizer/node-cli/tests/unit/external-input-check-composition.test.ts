import { describe, expect, it } from 'vitest';

import { createPlacementCompositionMapping } from '../../../core/src/subcircuit/placementCompositionMapping.ts';
import { DataPtFactory } from '../../../core/src/synthesizer/dataStructure/dataPt.ts';
import { PlacementManager } from '../../../core/src/synthesizer/runtime/placementManager.ts';
import { UINT256_DATA_PT_TYPE, type DataPt } from '../../../core/src/synthesizer/types/dataStructure.ts';

const word = (value: bigint, source: number, wireIndex = 0): DataPt => DataPtFactory.create({
  source,
  wireIndex,
  dataPtType: UINT256_DATA_PT_TYPE,
}, value);

const subcircuitInfo = (name: 'ADD' | 'CheckBus256', id: number, inputCount: number) => ({
  id,
  name,
  NWires: 1 + inputCount * 2 + (name === 'CheckBus256' ? 0 : 2),
  NInWires: inputCount * 2,
  NOutWires: name === 'CheckBus256' ? 0 : 2,
  inWireIndex: name === 'CheckBus256' ? 1 : 3,
  outWireIndex: 1,
  logicalInterface: {
    inputs: Array.from({ length: inputCount }, (_, index) => ({
      name: `in${index}`,
      logicalType: { kind: 'uint' as const, bits: 256 },
    })),
    outputs: name === 'CheckBus256'
      ? []
      : [{ name: 'result', logicalType: { kind: 'uint' as const, bits: 256 } }],
  },
});

const createPlacementManager = (outputValues: readonly bigint[] = [7n]): PlacementManager => {
  const mapping = createPlacementCompositionMapping({
    nPrivateMessageInputs: 29,
    nPoseidonBatch: 6,
  });
  return Object.assign(Object.create(PlacementManager.prototype), {
    _placements: Array.from({ length: 7 }, () => ({
      name: 'bufferEVMIn', usage: 'test', subcircuitId: 0, inPts: [], outPts: [],
    })),
    _placementCompositionMapping: { ADD: mapping.ADD },
    _bufferSubcircuitByBuffer: { EVM_IN: { id: 0 } },
    _guardedBufferOutputWires: new Map(),
    subcircuitInfoByName: new Map([
      ['CheckBus256', subcircuitInfo('CheckBus256', 1, 1)],
      ['ADD', subcircuitInfo('ADD', 2, 2)],
    ]),
    subcircuitLibrary: {
      calculateSubcircuitOutputValues: (name: string, values: readonly bigint[]) => {
        if (name === 'CheckBus256') return [];
        return outputValues;
      },
    },
  }) as PlacementManager;
};

describe('external input checks in generic compositions', () => {
  it('places one CheckBus256 per required direct buffer operand before ADD', () => {
    const placementManager = createPlacementManager([5n]);

    const result = placementManager.placeComposition('ADD', [word(2n, 0), word(3n, 1)]);
    const placements = placementManager.placements.slice(7);

    expect(placements.map(({ name }) => name)).toEqual(['CheckBus256', 'CheckBus256', 'ADD']);
    expect(placements[2]!.inPts.map(({ source }) => source)).toEqual([0, 1]);
    expect(result).toMatchObject([{ source: 9, wireIndex: 0, value: 5n }]);
  });

  it('does not check an operand produced by an earlier non-buffer placement', () => {
    const placementManager = createPlacementManager([5n]);
    (placementManager as unknown as { _placements: unknown[] })._placements.push({
      name: 'ADD', usage: 'test', subcircuitId: 2, inPts: [], outPts: [],
    });

    placementManager.placeComposition('ADD', [word(2n, 7), word(3n, 1)]);
    const placements = placementManager.placements.slice(8);

    expect(placements.map(({ name }) => name)).toEqual(['CheckBus256', 'ADD']);
    expect(placements[1]!.inPts.map(({ source }) => source)).toEqual([7, 1]);
  });

  it('does not reuse a guard for an equal-valued distinct buffer wire', () => {
    const placementManager = createPlacementManager([5n]);

    placementManager.placeComposition('ADD', [word(2n, 0), word(3n, 1)]);
    placementManager.placeComposition('ADD', [word(2n, 2), word(3n, 1)]);
    const placements = placementManager.placements.slice(10);

    expect(placements.map(({ name }) => name)).toEqual(['CheckBus256', 'ADD']);
    expect(placements[0]!.inPts).toMatchObject([{ source: 2, wireIndex: 0 }]);
  });

  it('does not record input checks when the operation candidate is invalid', () => {
    const placementManager = createPlacementManager([]);

    expect(() => placementManager.placeComposition('ADD', [word(2n, 0), word(3n, 1)])).toThrow(
      'ADD produced 0 outputs, but its logical interface declares 1',
    );
    expect(placementManager.placements).toHaveLength(7);
  });
});

describe('topology-fixed arbitrary statics', () => {
  it('reuses only values with the same explicit fixed usage', () => {
    const placementManager = Object.assign(Object.create(PlacementManager.prototype), {
      _placements: Array.from({ length: 7 }, () => ({
        name: 'bufferEVMIn', usage: 'test', subcircuitId: 0, inPts: [], outPts: [],
      })),
      _cachedTopologyFixedEVMIn: new Map(),
    }) as PlacementManager;

    const first = placementManager.allocateEVMInDataPt(
      3n,
      UINT256_DATA_PT_TYPE,
      'First PUSH immediate',
      { kind: 'topology-fixed', usage: 'push-immediate' },
    );
    const reused = placementManager.allocateEVMInDataPt(
      3n,
      UINT256_DATA_PT_TYPE,
      'Second PUSH immediate',
      { kind: 'topology-fixed', usage: 'push-immediate' },
    );
    const distinctUsage = placementManager.allocateEVMInDataPt(
      3n,
      UINT256_DATA_PT_TYPE,
      'Memory ownership mask',
      { kind: 'topology-fixed', usage: 'memory-view-ownership-mask' },
    );

    expect(reused).toMatchObject({ source: first.source, wireIndex: first.wireIndex });
    expect(distinctUsage).not.toMatchObject({ source: first.source, wireIndex: first.wireIndex });
  });

  it('allocates a fresh EVM_IN wire for every uncached static input', () => {
    const placementManager = Object.assign(Object.create(PlacementManager.prototype), {
      _placements: Array.from({ length: 7 }, () => ({
        name: 'bufferEVMIn', usage: 'test', subcircuitId: 0, inPts: [], outPts: [],
      })),
      _cachedTopologyFixedEVMIn: new Map(),
    }) as PlacementManager;

    const first = placementManager.allocateEVMInDataPt(
      3n,
      UINT256_DATA_PT_TYPE,
      'First uncached input',
      { kind: 'uncached' },
    );
    const second = placementManager.allocateEVMInDataPt(
      3n,
      UINT256_DATA_PT_TYPE,
      'Second uncached input',
      { kind: 'uncached' },
    );

    expect(second).not.toMatchObject({ source: first.source, wireIndex: first.wireIndex });
  });
});
