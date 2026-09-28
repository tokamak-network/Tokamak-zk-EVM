import { describe, expect, it } from 'vitest';

import { DataPtFactory } from '../../../core/src/synthesizer/dataStructure/dataPt.ts';
import { MemoryPt } from '../../../core/src/synthesizer/dataStructure/memoryPt.ts';
import { UINT256_DATA_PT_TYPE } from '../../../core/src/synthesizer/types/dataStructure.ts';

const wordPt = (value: bigint) => DataPtFactory.create({
  source: 7,
  wireIndex: 0,
  dataPtType: UINT256_DATA_PT_TYPE,
}, value);

describe('MemoryPt MemoryView geometry', () => {
  it('tracks an accessed range without changing memory geometry', () => {
    const memoryPt = new MemoryPt();

    memoryPt.write(0, 4, wordPt(0x11223344n));
    memoryPt.getDataAlias(1, 2);
    memoryPt.getDataAlias(8, 1);

    expect(memoryPt.viewMemory(0, 9)).toEqual(
      new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x00, 0x00, 0x00, 0x00, 0x00]),
    );
  });

  it('derives the right-shifted partial-view contribution once', () => {
    const memoryPt = new MemoryPt();
    memoryPt.write(4, 4, wordPt(0x11223344n));

    const [geometry] = memoryPt.getDataAlias(5, 2);

    expect(geometry).toMatchObject({
      shiftMagnitude: 1,
      direction: 1,
      ownershipMask: 0b11n,
    });
  });

  it('preserves an unshifted complete view as one owned word fragment', () => {
    const memoryPt = new MemoryPt();
    memoryPt.write(0, 4, wordPt(0x11223344n));

    const [geometry] = memoryPt.getDataAlias(0, 4);

    expect(geometry).toMatchObject({
      shiftMagnitude: 0,
      direction: 0,
      ownershipMask: 0b1111n,
    });
  });

  it('partitions an overwritten view into non-overlapping latest fragments', () => {
    const memoryPt = new MemoryPt();
    memoryPt.write(0, 4, wordPt(0x11223344n));
    memoryPt.write(1, 2, wordPt(0xaabbn));

    const geometries = memoryPt.getDataAlias(0, 4);

    expect(geometries.map(({ ownershipMask }) => ownershipMask)).toEqual([0b1001n, 0b0110n]);
    expect(geometries.reduce(
      (coverage, { ownershipMask }) => coverage | ownershipMask,
      0n,
    )).toBe(0b1111n);
    expect(memoryPt.viewMemory(0, 4)).toEqual(new Uint8Array([0x11, 0xaa, 0xbb, 0x44]));
  });

  it('preserves zero gaps and a partial write in the recovered memory view', () => {
    const memoryPt = new MemoryPt();
    memoryPt.write(1, 2, wordPt(0xaabbn));

    expect(memoryPt.viewMemory(0, 4)).toEqual(
      new Uint8Array([0x00, 0xaa, 0xbb, 0x00]),
    );
    const [geometry] = memoryPt.getDataAlias(0, 4);
    expect(geometry).toMatchObject({
      ownershipMask: 0b0110n,
    });
  });
});
