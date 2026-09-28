import { describe, expect, it } from 'vitest';

import { PermutationGenerator } from '../../../core/src/circuitGenerator/generators/permutationGenerator.ts';
import { DataPtFactory } from '../../../core/src/synthesizer/dataStructure/dataPt.ts';
import { BIT_DATA_PT_TYPE, type DataPt } from '../../../core/src/synthesizer/types/dataStructure.ts';
import type { Placements, PlacementVariables } from '../../../core/src/synthesizer/types/placements.ts';
import { BUFFER_LIST } from '../../../core/src/subcircuit/configuredTypes.ts';

const point = (source: number, wireIndex = 0): DataPt =>
  DataPtFactory.create({ source, wireIndex, dataPtType: BIT_DATA_PT_TYPE }, 1n);

const subcircuit = (
  id: number,
  name: string,
  bufferDirection: 'in' | 'out',
  publicRange: readonly [number, number] = [0, 0],
) => ({
  id,
  name,
  NWires: 5,
  NRealWires: 3,
  NInWires: 1,
  NOutWires: 1,
  inWireIndex: 2,
  outWireIndex: 1,
  wiringRange: [0, 3] as const,
  publicRange,
  internalRange: [4, 0] as const,
  bufferDirection,
});

const privateInfo = subcircuit(0, 'bufferPrvIn', 'in');
const storageLoadInfo = subcircuit(1, 'bufferStorageLoad', 'out');
const evmInfo = subcircuit(2, 'bufferEVMIn', 'in', [2, 1]);

const createLibrary = () => {
  const subcircuitInfoByName = new Map([
    [privateInfo.name, privateInfo],
    [storageLoadInfo.name, storageLoadInfo],
    [evmInfo.name, evmInfo],
  ]);
  const subcircuitBufferMapping = Object.fromEntries(
    BUFFER_LIST.map(buffer => {
      switch (buffer) {
        case 'PRIVATE_IN': return [buffer, privateInfo];
        case 'STORAGE_LOAD': return [buffer, storageLoadInfo];
        case 'EVM_IN': return [buffer, evmInfo];
        default: return [buffer, undefined];
      }
    }),
  );
  return {
    data: {
      setupParams: { n: 4, m: 5, m_b: 4, t: 4, s: 16, publicWirePhases: [] },
      subcircuitInfo: [privateInfo, storageLoadInfo, evmInfo],
    },
    subcircuitInfoByName,
    subcircuitBufferMapping,
  } as never;
};

const privatePlacement = (placementId: number) => ({
  name: 'bufferPrvIn' as const,
  usage: 'PRIVATE_IN',
  subcircuitId: privateInfo.id,
  inPts: [point(placementId)],
  outPts: [point(placementId)],
});

const evmPlacement = (placementId: number) => ({
  name: 'bufferEVMIn' as const,
  usage: 'EVM_IN',
  subcircuitId: evmInfo.id,
  inPts: [point(placementId)],
  outPts: [point(placementId)],
});

const successfulPlacements = (): Placements => [
  privatePlacement(0),
  privatePlacement(1),
  privatePlacement(2),
  privatePlacement(3),
  privatePlacement(4),
  evmPlacement(5),
];

const variablesFor = (placements: Placements): PlacementVariables =>
  placements.map(placement => ({
    subcircuitId: placement.subcircuitId,
    variables: ['0x01', '0x01', '0x01', '0x00', '0x00'],
    instanceList: ['', '', '', '', ''],
  }));

const createPermutationGenerator = (
  placements: Placements,
  placementVariables = variablesFor(placements),
): PermutationGenerator => new PermutationGenerator(placements, placementVariables, createLibrary());

describe('PermutationGenerator normalized wiring grid', () => {
  it('keeps unused input-buffer wires as identities and emits the constant-one cycle', () => {
    const result = createPermutationGenerator(successfulPlacements()).permutation;
    expect(result).toHaveLength(7);
    expect(result.some(entry => entry.row === 2 && entry.col === 5)).toBe(true);
    expect(result.some(entry => entry.row === 0 && entry.col === 0)).toBe(true);
    expect(result.some(entry => entry.row === 1 || entry.row === 3)).toBe(false);
  });

  it('rejects an unparented real input of an output buffer', () => {
    const placements: Placements = [
      {
        name: 'bufferStorageLoad',
        usage: 'STORAGE_LOAD',
        subcircuitId: storageLoadInfo.id,
        inPts: [point(0)],
        outPts: [point(0)],
      },
      ...successfulPlacements().slice(1),
    ];
    expect(() => createPermutationGenerator(placements)).toThrow('ordinary input wire has no parent output');
  });

  it('rejects non-zero declared wiring padding', () => {
    const placements = successfulPlacements();
    const variables = variablesFor(placements);
    variables[0]!.variables[3] = '0x01';
    expect(() => createPermutationGenerator(placements, variables)).toThrow('non-zero wiring padding');
  });

  it('rejects placement variables that do not match placement order', () => {
    const placements = successfulPlacements();
    const variables = variablesFor(placements);
    variables[0] = { ...variables[0]!, subcircuitId: evmInfo.id };
    expect(() => createPermutationGenerator(placements, variables)).toThrow('does not match its variable entry');
  });
});
