import { describe, expect, it, vi } from 'vitest';

import { VariableGenerator } from '../../../core/src/circuitGenerator/generators/variableGenerator.ts';
import { BUFFER_LIST } from '../../../core/src/subcircuit/configuredTypes.ts';
import { DataPtFactory } from '../../../core/src/synthesizer/dataStructure/dataPt.ts';
import {
  BIT_DATA_PT_TYPE,
  BLS12_381_FR_DATA_PT_TYPE,
  UINT256_DATA_PT_TYPE,
  type DataPt,
  type DataPtType,
} from '../../../core/src/synthesizer/types/dataStructure.ts';
import type { PlacementEntry, Placements, PlacementVariables } from '../../../core/src/synthesizer/types/placements.ts';

const expand = (generator: VariableGenerator, dataPt: DataPt): DataPt[] =>
  (
    generator as unknown as {
      _expandDataPtIntoCircomWires(dataPt: DataPt): DataPt[];
    }
  )._expandDataPtIntoCircomWires(dataPt);

const dataPt = (value: bigint, dataPtType: DataPtType, source = 0, wireIndex = 0): DataPt =>
  DataPtFactory.create({ source, wireIndex, dataPtType }, value);

const BUFFER_SUBCIRCUITS = [
  'bufferLogOut',
  'bufferStorageStore',
  'bufferStorageLoad',
  'bufferTxIn',
  'bufferBlockIn',
  'bufferEVMIn',
  'bufferPrvIn',
] as const;

const privateBufferIndex = BUFFER_LIST.indexOf('PRIVATE_IN');

const createBufferPlacements = (): Placements =>
  BUFFER_SUBCIRCUITS.map((name, subcircuitId) => ({
    name,
    usage: BUFFER_LIST[subcircuitId],
    subcircuitId,
    inPts: [],
    outPts: [],
  }));

const addPrivateBufferValue = (placements: Placements, value: bigint, dataPtType: DataPtType): void => {
  const placement = placements[privateBufferIndex];
  const inPt = dataPt(value, dataPtType, privateBufferIndex, placement.inPts.length);
  placement.inPts.push(inPt);
  placement.outPts.push(DataPtFactory.createBufferTwin(inPt));
};

const createBufferGenerator = (privateBufferCapacity: number): VariableGenerator => {
  const subcircuitBufferMapping = Object.fromEntries(
    BUFFER_LIST.map((buffer, index) => [
      buffer,
      {
        name: BUFFER_SUBCIRCUITS[index],
        NInWires: buffer === 'PRIVATE_IN' ? privateBufferCapacity : 1024,
      },
    ]),
  );

  return new VariableGenerator(
    {
      placements: [],
      subcircuitLibrary: {
        subcircuitBufferMapping,
        data: { setupParams: { s: 256 } },
      },
    } as never,
    {
      subcircuitBufferMapping,
      data: { setupParams: { s: 256 } },
    } as never,
  );
};

const convertAndValidateBuffers = (generator: VariableGenerator, placements: Placements): void => {
  const privateGenerator = generator as unknown as {
    _convertEVMWiresIntoCircomWires(placements: Placements): void;
    _validateBufferSizes(placements: Placements): void;
  };
  privateGenerator._convertEVMWiresIntoCircomWires(placements);
  privateGenerator._validateBufferSizes(placements);
};

const prepareCircuitInstance = (
  generator: VariableGenerator,
  placement: PlacementEntry,
  target: 'In' | 'Out',
): { values: `0x${string}`[]; descriptions: string[] } =>
  (
    generator as unknown as {
      _prepareCircuitInstance(
        placement: PlacementEntry,
        target: 'In' | 'Out',
      ): { values: `0x${string}`[]; descriptions: string[] };
    }
  )._prepareCircuitInstance(placement, target);

const createGeneratorWithSubcircuits = (
  subcircuits: readonly { name: string; id: number; NInWires: number; NOutWires: number }[],
  bufferNames: readonly string[] = [],
): VariableGenerator => {
  const subcircuitInfoByName = new Map(
    subcircuits.map(subcircuit => [
      subcircuit.name,
      {
        ...subcircuit,
        NWires: 1 + subcircuit.NOutWires + subcircuit.NInWires,
        NRealWires: 1 + subcircuit.NOutWires + subcircuit.NInWires,
        inWireIndex: 1 + subcircuit.NOutWires,
        outWireIndex: 1,
        wiringRange: [0, 1 + subcircuit.NOutWires + subcircuit.NInWires],
        publicRange: [0, 0],
        internalRange: [1 + subcircuit.NOutWires + subcircuit.NInWires, 0],
      },
    ]),
  );
  const subcircuitBufferMapping = Object.fromEntries(
    BUFFER_LIST.map(buffer => [
      buffer,
      bufferNames.includes(buffer)
        ? subcircuitInfoByName.get(BUFFER_SUBCIRCUITS[BUFFER_LIST.indexOf(buffer)])
        : undefined,
    ]),
  );
  return new VariableGenerator(
    {} as never,
    {
      subcircuitInfoByName,
      subcircuitBufferMapping,
      data: {
        setupParams: { s: 256 },
      },
    } as never,
  );
};

describe('VariableGenerator word encoding', () => {
  it('emits the lower 128-bit limb before the upper 128-bit limb', () => {
    const lower = 0x0123456789abcdef0123456789abcdefn;
    const upper = 0xfedcba9876543210fedcba9876543210n;
    const word = DataPtFactory.create(
      {
        source: 0,
        wireIndex: 0,
        dataPtType: UINT256_DATA_PT_TYPE,
        extSource: 'word source',
        extDest: 'word destination',
      },
      (upper << 128n) | lower,
    );
    const generator = new VariableGenerator({} as never, {} as never);

    const limbs = expand(generator, word);

    expect(limbs.map(limb => limb.value)).toEqual([lower, upper]);
    expect(limbs.map(limb => limb.extSource)).toEqual(['word source (lower 16 bytes)', 'word source (upper 16 bytes)']);
    expect(limbs.map(limb => limb.extDest)).toEqual([
      'word destination (lower 16 bytes)',
      'word destination (upper 16 bytes)',
    ]);
  });

  it('keeps a one-limb integer as one physical wire', () => {
    const generator = new VariableGenerator({} as never, {} as never);
    const original = dataPt(1n, BIT_DATA_PT_TYPE, 7, 3);

    const wires = expand(generator, original);

    expect(wires).toHaveLength(1);
    expect(wires[0]).toEqual(original);
    expect(wires[0]).not.toBe(original);
  });

  it('keeps a native field value as one physical wire', () => {
    const generator = new VariableGenerator({} as never, {} as never);
    const original = dataPt(123n, BLS12_381_FR_DATA_PT_TYPE, 8, 5);

    const wires = expand(generator, original);

    expect(wires).toHaveLength(1);
    expect(wires[0]).toEqual(original);
    expect(wires[0]).not.toBe(original);
  });
});

describe('VariableGenerator interface materialization', () => {
  it('normalizes wiring and internal witness blocks while zero-filling only padding', async () => {
    const subcircuitInfo = {
      id: 10,
      name: 'ADD',
      NInWires: 1,
      NOutWires: 1,
      NWires: 8,
      NRealWires: 5,
      inWireIndex: 2,
      outWireIndex: 1,
      wiringRange: [0, 3],
      publicRange: [0, 0],
      internalRange: [4, 2],
    };
    const generator = new VariableGenerator(
      {} as never,
      {
        subcircuitInfoByName: new Map([[subcircuitInfo.name, subcircuitInfo]]),
        subcircuitBufferMapping: {},
        data: { setupParams: { s: 1 } },
      } as never,
    );
    const privateGenerator = generator as unknown as {
      _generateSubcircuitWitness(subcircuitId: number, inValues: string[]): Promise<string[]>;
      _generatePlacementVariables(placements: Placements): Promise<PlacementVariables>;
    };
    privateGenerator._generateSubcircuitWitness = async () => ['0x1', '0x05', '0x07', '0xaa', '0xbb'];
    const placement: PlacementEntry = {
      name: 'ADD',
      usage: 'ADD',
      subcircuitId: 10,
      inPts: [DataPtFactory.create({ source: 0, wireIndex: 0, dataPtType: UINT256_DATA_PT_TYPE, extSource: 'input' }, 7n)],
      outPts: [DataPtFactory.create({ source: 0, wireIndex: 0, dataPtType: UINT256_DATA_PT_TYPE, extDest: 'output' }, 5n)],
    };

    await expect(privateGenerator._generatePlacementVariables([placement])).resolves.toEqual([{
      subcircuitId: 10,
      variables: ['0x1', '0x05', '0x07', '0x00', '0xaa', '0xbb', '0x00', '0x00'],
      instanceList: ['', 'output', 'input', '', '', '', '', ''],
    }]);
  });

  it('rejects a missing WASM artifact before witness generation', async () => {
    const generator = new VariableGenerator(
      {} as never,
      { loadWasm: async () => undefined } as never,
    );
    const privateGenerator = generator as unknown as {
      _generateSubcircuitWitness(subcircuitId: number, inValues: string[]): Promise<string[]>;
    };

    await expect(privateGenerator._generateSubcircuitWitness(10, ['0x01'])).rejects.toThrow(
      '10-th subcircuit WASM is unavailable',
    );
  });

  it('rejects a missing non-buffer input instead of zero-padding it', () => {
    const generator = createGeneratorWithSubcircuits([{ name: 'ADD', id: 10, NInWires: 1, NOutWires: 1 }]);
    const placement: PlacementEntry = {
      name: 'ADD',
      usage: 'ADD',
      subcircuitId: 10,
      inPts: [],
      outPts: [dataPt(0n, UINT256_DATA_PT_TYPE)],
    };

    expect(() => prepareCircuitInstance(generator, placement, 'In')).toThrow(
      'Placement ADD has 0 In wires, expected 1',
    );
  });

  it('continues to zero-pad unused declared buffer capacity', () => {
    const generator = createGeneratorWithSubcircuits(
      [{ name: 'bufferEVMIn', id: 10, NInWires: 2, NOutWires: 2 }],
      ['EVM_IN'],
    );
    const placement: PlacementEntry = {
      name: 'bufferEVMIn',
      usage: 'EVM_IN',
      subcircuitId: 10,
      inPts: [dataPt(1n, BIT_DATA_PT_TYPE)],
      outPts: [dataPt(1n, BIT_DATA_PT_TYPE)],
    };

    expect(prepareCircuitInstance(generator, placement, 'In').values).toEqual(['0x1', '0x00']);
  });

});

describe('VariableGenerator buffer wire capacity', () => {
  it('preserves a buffer twin data type', () => {
    const original = dataPt(123n, BLS12_381_FR_DATA_PT_TYPE, privateBufferIndex, 0);

    const twin = DataPtFactory.createBufferTwin(original);

    expect(twin.dataPtType).toEqual(original.dataPtType);
    expect(twin).not.toBe(original);
  });

  it('accepts mixed canonical types that exactly fill the input-wire capacity', () => {
    const placements = createBufferPlacements();
    addPrivateBufferValue(placements, 1n, BIT_DATA_PT_TYPE);
    addPrivateBufferValue(placements, 123n, BLS12_381_FR_DATA_PT_TYPE);
    addPrivateBufferValue(placements, (1n << 255n) + 7n, UINT256_DATA_PT_TYPE);

    convertAndValidateBuffers(createBufferGenerator(4), placements);

    expect(placements[privateBufferIndex].inPts).toHaveLength(4);
    expect(placements[privateBufferIndex].outPts).toHaveLength(4);
  });

  it('rejects one physical input wire beyond capacity without counting outputs', () => {
    const placements = createBufferPlacements();
    addPrivateBufferValue(placements, 1n, BIT_DATA_PT_TYPE);
    addPrivateBufferValue(placements, 123n, BLS12_381_FR_DATA_PT_TYPE);
    addPrivateBufferValue(placements, (1n << 255n) + 7n, UINT256_DATA_PT_TYPE);
    addPrivateBufferValue(placements, 0n, BIT_DATA_PT_TYPE);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(() => convertAndValidateBuffers(createBufferGenerator(4), placements)).toThrow('Resolve above errors.');
    expect(placements[privateBufferIndex].inPts).toHaveLength(5);
    expect(placements[privateBufferIndex].outPts).toHaveLength(5);
    log.mockRestore();
  });
});
