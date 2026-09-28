import { createAddressFromBigInt, bigIntToBytes, setLengthLeft } from '@ethereumjs/util';
import { describe, expect, it, vi } from 'vitest';

import { InstructionHandler } from '../../../core/src/synthesizer/runtime/instructionHandler.ts';
import { BUFFER_LIST } from '../../../core/src/subcircuit/configuredTypes.ts';
import { DataPtFactory, StackPt } from '../../../core/src/synthesizer/dataStructure/index.ts';
import {
  ContextManager,
  type InitialStorageRead,
} from '../../../core/src/synthesizer/runtime/contextManager.ts';
import { PlacementManager } from '../../../core/src/synthesizer/runtime/placementManager.ts';
import { VARIABLE_DESCRIPTION } from '../../../core/src/synthesizer/types/buffers.ts';
import {
  type StorageCacheEntry,
  UINT256_DATA_PT_TYPE,
} from '../../../core/src/synthesizer/types/dataStructure.ts';
import type { DataPt } from '../../../core/src/synthesizer/types/index.ts';

const dataPt = (
  value: bigint,
  source: number,
  wireIndex = 0,
): DataPt => DataPtFactory.create({
  source,
  wireIndex,
  dataPtType: UINT256_DATA_PT_TYPE,
}, value);

const storageAccessInfo = {
  id: 14,
  name: 'StorageAccess' as const,
  NWires: 7,
  NInWires: 6,
  NOutWires: 0,
  inWireIndex: 1,
  outWireIndex: 1,
};

const logOutInfo = {
  id: 0,
  name: 'bufferLogOut' as const,
  NWires: 129,
  NInWires: 64,
  NOutWires: 64,
  inWireIndex: 65,
  outWireIndex: 1,
};

const createManagers = () => {
  const placementManager = Object.assign(Object.create(PlacementManager.prototype), {
    _placements: [{
      name: 'bufferLogOut',
      usage: 'test LOG_OUT',
      subcircuitId: 0,
      inPts: [],
      outPts: [],
    }],
    subcircuitInfoByName: new Map([
      ['bufferLogOut', logOutInfo],
      ['StorageAccess', storageAccessInfo],
    ]),
  }) as PlacementManager;
  const contextManager = new ContextManager(placementManager);
  return { contextManager, placementManager };
};

const createStorageHarness = (initialValue: bigint) => {
  let storageValue = initialValue;
  let nextSource = 100;
  const addressValue = 0x1234n;
  const address = createAddressFromBigInt(addressValue);

  const stateManager = {
    getStorage: vi.fn(async () => setLengthLeft(bigIntToBytes(storageValue), 32)),
  };
  const cachedOpts = { stateManager };
  const parent: any = {
    subcircuitLibrary: {
      subcircuitInfoByName: new Map([['StorageAccess', storageAccessInfo]]),
    },
    placeComposition: vi.fn(),
    addReservedVariableToBufferIn: vi.fn((_name: string, value: bigint) =>
      dataPt(value, nextSource++),
    ),
    addReservedVariableToBufferOut: vi.fn((_name: string, valuePt: DataPt) =>
      dataPt(valuePt.value, nextSource++),
    ),
  };
  const placementManager = {
    placements: [],
    placeComposition: parent.placeComposition,
    addReservedVariableToBufferIn: parent.addReservedVariableToBufferIn,
    addReservedVariableToBufferOut: parent.addReservedVariableToBufferOut,
    allocateEVMInDataPt: vi.fn(),
  };
  parent.state = new ContextManager(placementManager as never);

  return {
    address,
    addressValue,
    handler: new InstructionHandler(
      parent.state,
      placementManager as never,
      parent.subcircuitLibrary as never,
      cachedOpts as never,
    ),
    parent,
    readStorage: (addressPt: DataPt, keyPt: DataPt, observedValue: bigint) =>
      parent.state.readStorage(addressPt, keyPt, observedValue),
    stateManager,
    setStorageValue: (value: bigint) => {
      storageValue = value;
    },
    writeStorage: (
      addressPt: DataPt,
      keyPt: DataPt,
      valuePt: DataPt,
      observedValue: bigint,
    ) => parent.state.writeStorage(addressPt, keyPt, valuePt, observedValue),
  };
};

const storageAccessCompositions = (parent: {
  placeComposition: ReturnType<typeof vi.fn>;
}): DataPt[][] => parent.placeComposition.mock.calls
  .filter(([operation]) => operation === 'StorageAccess')
  .map(([, operands]) => operands as DataPt[]);

describe('StateManager storage tracking', () => {
  it('owns a resettable snapshot of transaction message code addresses', () => {
    const { contextManager: state } = createManagers();
    state.recordMessageCodeAddress('0x1234');
    state.recordMessageCodeAddress('0x1234');
    state.recordMessageCodeAddress('0x5678');

    const snapshot = state.messageCodeAddresses;
    expect(snapshot).toEqual(['0x1234', '0x5678']);
    expect(snapshot).not.toBe(state.messageCodeAddresses);

    state.resetTransactionTracking();
    expect(state.messageCodeAddresses).toEqual([]);
  });

  it('uses a full 256-bit value for the private initial storage input', () => {
    const value = (1n << 256n) - 1n;

    expect(DataPtFactory.create(VARIABLE_DESCRIPTION.STORAGE_READ, value)).toMatchObject({
      dataPtType: UINT256_DATA_PT_TYPE,
      value,
    });
    expect(VARIABLE_DESCRIPTION.STORAGE_READ.source).toBe(
      BUFFER_LIST.indexOf('PRIVATE_IN'),
    );
    expect(VARIABLE_DESCRIPTION.SLOAD_VALUE.source).toBe(
      BUFFER_LIST.indexOf('STORAGE_LOAD'),
    );
    expect(VARIABLE_DESCRIPTION.SLOAD_VALUE.extDest).toBe('Initial storage read value');
  });

  it('enforces reserved-buffer direction before appending wires', () => {
    const placementManager = Object.assign(Object.create(PlacementManager.prototype), {
      _placements: BUFFER_LIST.map((buffer) => ({
        name: buffer,
        usage: 'test buffer',
        subcircuitId: 0,
        inPts: [],
        outPts: [],
      })),
      _bufferSubcircuitByBuffer: {
        PRIVATE_IN: { bufferDirection: 'in' },
        STORAGE_LOAD: { bufferDirection: 'out' },
      },
    }) as PlacementManager;

    expect(() => placementManager.addReservedVariableToBufferIn('SLOAD_VALUE', 1n, true))
      .toThrow('SLOAD_VALUE must be added through an input buffer');
    expect(() => placementManager.addReservedVariableToBufferOut(
      'STORAGE_READ',
      dataPt(1n, 1),
      true,
    )).toThrow('STORAGE_READ must be added through an output buffer');

    const privateValuePt = placementManager.addReservedVariableToBufferIn(
      'STORAGE_READ',
      1n,
      true,
    );
    const publicValuePt = placementManager.addReservedVariableToBufferOut(
      'SLOAD_VALUE',
      privateValuePt,
      true,
    );

    expect(privateValuePt.source).toBe(BUFFER_LIST.indexOf('PRIVATE_IN'));
    expect(publicValuePt.source).toBe(BUFFER_LIST.indexOf('STORAGE_LOAD'));
  });

  it('rejects absent qap buffer-direction metadata before appending wires', () => {
    const placementManager = Object.assign(Object.create(PlacementManager.prototype), {
      _placements: BUFFER_LIST.map((buffer) => ({
        name: buffer,
        usage: 'test buffer',
        subcircuitId: 0,
        inPts: [],
        outPts: [],
      })),
      _bufferSubcircuitByBuffer: {
        PRIVATE_IN: {},
      },
    }) as PlacementManager;

    expect(() => placementManager.addReservedVariableToBufferIn('STORAGE_READ', 1n, true))
      .toThrow('Buffer direction metadata is not found for PRIVATE_IN');
    expect((placementManager as any)._placements[BUFFER_LIST.indexOf('PRIVATE_IN')]!.inPts)
      .toHaveLength(0);
  });

  it('exposes only dirty entries for final storage output', () => {
    const { contextManager: state } = createManagers();
    state.storageCache.set(1n, 2n, {
      canonicalAddressPt: dataPt(1n, 1),
      canonicalKeyPt: dataPt(2n, 2),
      latestValuePt: dataPt(3n, 3),
      dirty: false,
    });
    state.storageCache.set(4n, 5n, {
      canonicalAddressPt: dataPt(4n, 4),
      canonicalKeyPt: dataPt(5n, 5),
      latestValuePt: dataPt(6n, 6),
      dirty: true,
    });

    expect(state.storageCache.dirtyEntries.map((entry) => [
      entry.canonicalAddressPt.value,
      entry.canonicalKeyPt.value,
      entry.latestValuePt.value,
    ])).toEqual([[4n, 5n, 6n]]);
  });

  it('coordinates nested storage-cache and LOG_OUT frame rollback', () => {
    const { contextManager: state, placementManager } = createManagers();
    const baseEntry: StorageCacheEntry = {
      canonicalAddressPt: dataPt(1n, 1),
      canonicalKeyPt: dataPt(2n, 2),
      latestValuePt: dataPt(3n, 3),
      dirty: false,
    };
    state.storageCache.set(1n, 2n, baseEntry);

    state.beginFrame(0);
    state.storageCache.set(1n, 2n, {
      ...baseEntry,
      latestValuePt: dataPt(4n, 4),
      dirty: true,
    });
    ;(placementManager as any)._appendBufferWirePair(dataPt(10n, 10), dataPt(10n, 0, 0), true);

    state.beginFrame(1);
    state.storageCache.set(1n, 2n, {
      ...baseEntry,
      latestValuePt: dataPt(5n, 5),
      dirty: true,
    });
    ;(placementManager as any)._appendBufferWirePair(dataPt(11n, 11), dataPt(11n, 0, 1), true);

    state.completeFrame(1, true);
    expect(placementManager.placements[0]).toMatchObject({
      inPts: [{ value: 10n }, { value: 11n }],
      outPts: [{ value: 10n }, { value: 11n }],
    });
    expect(state.storageCache.get(1n, 2n)?.latestValuePt.value).toBe(5n);

    state.completeFrame(0, false);
    expect(placementManager.placements).toHaveLength(1);
    expect(placementManager.placements[0]).toMatchObject({ inPts: [], outPts: [] });
    expect(state.storageCache.get(1n, 2n)).toMatchObject({
      latestValuePt: { value: 3n },
      dirty: false,
    });
  });

  it('rejects a dynamic buffer append that does not use the next output wire', () => {
    const { placementManager } = createManagers();
    ;(placementManager as any)._appendBufferWirePair(dataPt(10n, 10), dataPt(10n, 0, 0), true);

    expect(() => (placementManager as any)._appendBufferWirePair(
      dataPt(11n, 11),
      dataPt(11n, 0, 0),
      true,
    )).toThrow('Mismatch in the buffer wires');
  });

  it('restores only the storage cache and retains initial SLOAD records on frame failure', () => {
    const { contextManager: state } = createManagers();
    const parentEntry: StorageCacheEntry = {
      canonicalAddressPt: dataPt(1n, 1),
      canonicalKeyPt: dataPt(2n, 2),
      latestValuePt: dataPt(3n, 3),
      dirty: false,
    };
    state.storageCache.set(1n, 2n, parentEntry);
    state.storageCache.beginFrame(1);

    state.storageCache.set(1n, 2n, {
      ...parentEntry,
      latestValuePt: dataPt(4n, 4),
      dirty: true,
    });
    const childRead: InitialStorageRead = {
      addressPt: dataPt(1n, 5),
      keyPt: dataPt(6n, 6),
      valuePt: dataPt(7n, 7),
    };
    state.initialStorageReads.add(1n, 6n, childRead);
    state.storageCache.set(1n, 6n, {
      canonicalAddressPt: childRead.addressPt,
      canonicalKeyPt: childRead.keyPt,
      latestValuePt: childRead.valuePt,
      dirty: false,
    });

    state.storageCache.completeFrame(1, false);

    expect(state.storageCache.get(1n, 2n)).toMatchObject({
      latestValuePt: { value: 3n, source: 3 },
      dirty: false,
    });
    expect(state.storageCache.get(1n, 6n)).toBeUndefined();
    expect(state.initialStorageReads.get(1n, 6n)).toMatchObject({
      valuePt: { value: 7n, source: 7 },
    });
    expect(state.initialStorageReads.entries).toHaveLength(1);
  });

  it('keeps a successful child update until an enclosing frame rolls back', () => {
    const { contextManager: state } = createManagers();
    const baseEntry: StorageCacheEntry = {
      canonicalAddressPt: dataPt(1n, 1),
      canonicalKeyPt: dataPt(2n, 2),
      latestValuePt: dataPt(3n, 3),
      dirty: false,
    };
    state.storageCache.set(1n, 2n, baseEntry);
    state.storageCache.beginFrame(0);
    state.storageCache.beginFrame(1);
    state.storageCache.set(1n, 2n, {
      ...baseEntry,
      latestValuePt: dataPt(8n, 8),
      dirty: true,
    });

    state.storageCache.completeFrame(1, true);
    expect(state.storageCache.get(1n, 2n)).toMatchObject({
      latestValuePt: { value: 8n },
      dirty: true,
    });

    state.storageCache.completeFrame(0, false);
    expect(state.storageCache.get(1n, 2n)).toMatchObject({
      latestValuePt: { value: 3n },
      dirty: false,
    });
  });
});

describe('InstructionHandler opcode registration', () => {
  it('registers the existing REVERT handler at opcode 0xfd', () => {
    const { handler } = createStorageHarness(0n);

    expect(handler.opcodeHandlers.get(0xfd)).toBeTypeOf('function');
  });
});

describe('ContextManager storage cache', () => {
  it('registers one initial SLOAD and reuses its value DataPt on repeated reads', () => {
    const { addressValue, parent, readStorage } = createStorageHarness(5n);
    const firstAddressPt = dataPt(addressValue, 30);
    const firstKeyPt = dataPt(9n, 31);

    const firstValuePt = readStorage(firstAddressPt, firstKeyPt, 5n);
    const secondValuePt = readStorage(
      dataPt(addressValue, 40),
      dataPt(9n, 41),
      5n,
    );

    expect(parent.state.initialStorageReads.entries).toHaveLength(1);
    expect(parent.addReservedVariableToBufferIn.mock.calls.map(
      ([name]: [string]) => name,
    )).toEqual(['STORAGE_READ']);
    expect(parent.addReservedVariableToBufferOut.mock.calls.map(
      ([name, valuePt]: [string, DataPt]) => [name, valuePt.source, valuePt.value],
    )).toEqual([
      ['SLOAD_ADDRESS', 30, addressValue],
      ['SLOAD_KEY', 31, 9n],
      ['SLOAD_VALUE', 102, 5n],
    ]);
    expect(parent.state.initialStorageReads.entries[0]).toMatchObject({
      addressPt: { source: 30, value: addressValue },
      keyPt: { source: 31, value: 9n },
      valuePt: { source: 102, value: 5n },
    });
    expect(secondValuePt).toMatchObject({
      source: firstValuePt.source,
      wireIndex: firstValuePt.wireIndex,
      value: firstValuePt.value,
    });
    const storageAccessCalls = storageAccessCompositions(parent);
    expect(storageAccessCalls).toHaveLength(1);
    expect(storageAccessCalls[0]).toMatchObject([
      expect.objectContaining({ source: 40, value: addressValue }),
      expect.objectContaining({ source: 41, value: 9n }),
      expect.objectContaining({ source: 30, value: addressValue }),
      expect.objectContaining({ source: 31, value: 9n }),
    ]);
  });

  it('reuses a retained initial SLOAD after its frame is rolled back', () => {
    const { addressValue, parent, readStorage } = createStorageHarness(6n);
    parent.state.storageCache.beginFrame(1);
    const firstValuePt = readStorage(
      dataPt(addressValue, 42),
      dataPt(10n, 43),
      6n,
    );

    parent.state.storageCache.completeFrame(1, false);
    expect(parent.state.storageCache.get(addressValue, 10n)).toBeUndefined();

    const secondValuePt = readStorage(
      dataPt(addressValue, 44),
      dataPt(10n, 45),
      6n,
    );

    expect(parent.state.initialStorageReads.entries).toHaveLength(1);
    expect(parent.addReservedVariableToBufferIn).toHaveBeenCalledTimes(1);
    expect(parent.addReservedVariableToBufferOut).toHaveBeenCalledTimes(3);
    expect(secondValuePt).toMatchObject({
      source: firstValuePt.source,
      wireIndex: firstValuePt.wireIndex,
      value: 6n,
    });
    expect(storageAccessCompositions(parent)).toHaveLength(1);
  });

  it('updates the cached value on SSTORE and does not add an initial SLOAD afterward', () => {
    const { addressValue, parent, readStorage, setStorageValue, writeStorage } = createStorageHarness(11n);
    const keyPt = dataPt(7n, 50);
    const writePt = dataPt(11n, 51);

    writeStorage(dataPt(addressValue, 53), keyPt, writePt, 11n);
    setStorageValue(11n);
    const loadedPt = readStorage(
      dataPt(addressValue, 54),
      dataPt(7n, 55),
      11n,
    );

    expect(parent.state.initialStorageReads.entries).toHaveLength(0);
    expect(parent.addReservedVariableToBufferIn).not.toHaveBeenCalled();
    expect(parent.addReservedVariableToBufferOut).not.toHaveBeenCalled();
    expect(parent.state.storageCache.get(addressValue, 7n)).toMatchObject({
      latestValuePt: { source: 51, value: 11n },
      dirty: true,
    });
    expect(loadedPt).toMatchObject({ source: 51, value: 11n });
    expect(storageAccessCompositions(parent)).toHaveLength(1);
  });

  it('keeps only the latest value DataPt across repeated SSTORE operations', () => {
    const { addressValue, parent, setStorageValue, writeStorage } = createStorageHarness(10n);

    writeStorage(
      dataPt(addressValue, 70),
      dataPt(8n, 71),
      dataPt(10n, 72),
      10n,
    );
    setStorageValue(20n);
    writeStorage(
      dataPt(addressValue, 73),
      dataPt(8n, 74),
      dataPt(20n, 75),
      20n,
    );
    setStorageValue(30n);
    writeStorage(
      dataPt(addressValue, 76),
      dataPt(8n, 77),
      dataPt(30n, 78),
      30n,
    );

    expect(parent.state.storageCache.dirtyEntries).toEqual([
      expect.objectContaining({
        canonicalAddressPt: expect.objectContaining({ source: 70, value: addressValue }),
        canonicalKeyPt: expect.objectContaining({ source: 71, value: 8n }),
        latestValuePt: expect.objectContaining({ source: 78, value: 30n }),
        dirty: true,
      }),
    ]);
    const equalBatchCalls = storageAccessCompositions(parent);
    expect(equalBatchCalls.map((operands) => operands.map(({ source }) => source))).toEqual([
      [73, 74, 70, 71],
      [76, 77, 70, 71],
    ]);
    expect(parent.addReservedVariableToBufferOut).not.toHaveBeenCalled();
  });

  it('keeps the initial SLOAD record while replacing the cached value on SSTORE', () => {
    const { addressValue, parent, readStorage, setStorageValue, writeStorage } = createStorageHarness(12n);
    const initialValuePt = readStorage(
      dataPt(addressValue, 80),
      dataPt(9n, 81),
      12n,
    );

    setStorageValue(22n);
    writeStorage(
      dataPt(addressValue, 82),
      dataPt(9n, 83),
      dataPt(22n, 84),
      22n,
    );

    expect(parent.state.initialStorageReads.entries).toEqual([
      expect.objectContaining({
        addressPt: expect.objectContaining({ source: 80, value: addressValue }),
        keyPt: expect.objectContaining({ source: 81, value: 9n }),
        valuePt: expect.objectContaining({
          source: initialValuePt.source,
          value: 12n,
        }),
      }),
    ]);
    expect(parent.state.storageCache.dirtyEntries).toEqual([
      expect.objectContaining({
        canonicalAddressPt: expect.objectContaining({ source: 80, value: addressValue }),
        canonicalKeyPt: expect.objectContaining({ source: 81, value: 9n }),
        latestValuePt: expect.objectContaining({ source: 84, value: 22n }),
        dirty: true,
      }),
    ]);
    expect(storageAccessCompositions(parent)[0]?.map(({ source }) => source))
      .toEqual([82, 83, 80, 81]);
    expect(parent.addReservedVariableToBufferOut).toHaveBeenCalledTimes(3);
  });

  it('tracks distinct address and key pairs independently', () => {
    const { addressValue, parent, readStorage, setStorageValue, writeStorage } = createStorageHarness(1n);
    readStorage(dataPt(addressValue, 90), dataPt(1n, 91), 1n);

    setStorageValue(2n);
    readStorage(dataPt(addressValue + 1n, 92), dataPt(1n, 93), 2n);

    setStorageValue(3n);
    writeStorage(
      dataPt(addressValue, 94),
      dataPt(1n, 95),
      dataPt(3n, 96),
      3n,
    );

    setStorageValue(4n);
    writeStorage(
      dataPt(addressValue, 97),
      dataPt(2n, 98),
      dataPt(4n, 99),
      4n,
    );

    expect(parent.state.initialStorageReads.entries.map((entry: InitialStorageRead) => [
      entry.addressPt.value,
      entry.keyPt.value,
      entry.valuePt.value,
    ])).toEqual([
      [addressValue, 1n, 1n],
      [addressValue + 1n, 1n, 2n],
    ]);
    expect(parent.state.storageCache.dirtyEntries.map((entry: StorageCacheEntry) => [
      entry.canonicalAddressPt.value,
      entry.canonicalKeyPt.value,
      entry.latestValuePt.value,
    ])).toEqual([
      [addressValue, 1n, 3n],
      [addressValue, 2n, 4n],
    ]);
    expect(storageAccessCompositions(parent)).toHaveLength(1);
    expect(parent.addReservedVariableToBufferOut).toHaveBeenCalledTimes(6);
  });

  it('rejects a storageAddressPt that does not match the EVM storage address', async () => {
    const { address, handler, parent, stateManager } = createStorageHarness(5n);
    const stackPt = new StackPt();
    stackPt.push(dataPt(1n, 61));

    await expect(handler.handleSysFlow([1n], 5n, {
      op: 'SLOAD',
      stackPt,
      thisAddress: address,
      thisContext: { storageAddressPt: dataPt(0x9999n, 60) },
    } as any)).rejects.toThrow('Storage address mismatch');

    expect(stateManager.getStorage).not.toHaveBeenCalled();
    expect(parent.state.initialStorageReads.entries).toHaveLength(0);
  });
});
