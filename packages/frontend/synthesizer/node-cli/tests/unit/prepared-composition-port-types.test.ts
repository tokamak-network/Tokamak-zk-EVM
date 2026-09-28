import { describe, expect, it } from 'vitest';

import { PlacementManager } from '../../../core/src/synthesizer/runtime/placementManager.ts';
import { DataPtFactory } from '../../../core/src/synthesizer/dataStructure/dataPt.ts';
import {
  UINT160_DATA_PT_TYPE,
  UINT256_DATA_PT_TYPE,
  UINT32_DATA_PT_TYPE,
  type DataPt,
  type DataPtType,
} from '../../../core/src/synthesizer/types/dataStructure.ts';
import type { PlacementComposition } from '../../../core/src/subcircuit/placementCompositionMapping.ts';

const composition = {
  placementStrategy: 'generic',
  constants: [],
  canonicalityGuardOperandIndices: [],
  numSteps: 1,
  numOperands: 2,
  numResults: 1,
  steps: [{
    subcircuit: 'ALU3',
    selector: 1n,
    inputs: [
      { kind: 'selector' },
      { kind: 'operand', index: 0 },
      { kind: 'operand', index: 1 },
    ],
    outputs: [{ kind: 'result', index: 0 }],
  }],
} as const satisfies PlacementComposition;

const createDataPt = (
  dataPtType: DataPtType,
  source: number,
  wireIndex: number,
  value: bigint,
): DataPt => DataPtFactory.create({ dataPtType, source, wireIndex }, value);

function createPlacementManager(
  selectorType: DataPtType = UINT32_DATA_PT_TYPE,
  outputValues: readonly bigint[] = [5n],
): PlacementManager {
  return Object.assign(Object.create(PlacementManager.prototype), {
    _placements: Array.from({ length: 6 }, () => ({
      name: 'ALU3',
      usage: 'test',
      subcircuitId: 0,
      inPts: [],
      outPts: [],
    })),
    subcircuitInfoByName: new Map([['ALU3', {
      id: 0,
      name: 'ALU3',
      NWires: 8,
      NInWires: 5,
      NOutWires: 2,
      inWireIndex: 3,
      outWireIndex: 1,
      logicalInterface: {
        inputs: [
          { name: 'selector', logicalType: { kind: 'uint', bits: 32 } },
          { name: 'lhs', logicalType: { kind: 'uint', bits: 256 } },
          { name: 'rhs', logicalType: { kind: 'uint', bits: 256 } },
        ],
        outputs: [
          { name: 'result', logicalType: { kind: 'uint', bits: 256 } },
        ],
      },
    }]]),
    _placementCompositionMapping: { ADD: composition },
    subcircuitLibrary: {
      calculateSubcircuitOutputValues: () => outputValues,
    },
    getReservedInputBufferDataPt: () => createDataPt(selectorType, 5, 0, 1n),
  }) as PlacementManager;
}

const operands = (lhsType: DataPtType = UINT256_DATA_PT_TYPE): DataPt[] => [
  createDataPt(lhsType, 0, 0, 2n),
  createDataPt(UINT256_DATA_PT_TYPE, 1, 0, 3n),
]

describe('atomic composition logical ports', () => {
  it('accepts DataPt types that match every qap logical port', () => {
    const placementManager = createPlacementManager()

    expect(() => placementManager.placeComposition('ADD', operands())).not.toThrow()
    expect(placementManager.placements.at(-1)?.usage).toBe('ADD')
  })

  it('rejects a same-width DataPt whose logical port type differs', () => {
    const placementManager = createPlacementManager(UINT160_DATA_PT_TYPE)

    expect(() => placementManager.placeComposition('ADD', operands())).toThrow(
      'ADD ALU3 input port 0 (selector) expected uint32, but got uint160',
    )
    expect(placementManager.placements).toHaveLength(6)
  })

  it('rejects an operand whose physical wire count differs without recording a placement', () => {
    const placementManager = createPlacementManager()

    expect(() => placementManager.placeComposition('ADD', operands(UINT160_DATA_PT_TYPE))).toThrow(
      'ADD ALU3 expected 5 input wires, but got 4',
    )
    expect(placementManager.placements).toHaveLength(6)
  })

  it('accepts a narrower integer input for a native Fr port', () => {
    const placementManager = createPlacementManager()
    const subcircuit = placementManager.subcircuitInfoByName.get('ALU3')!
    subcircuit.NInWires = 4
    subcircuit.logicalInterface = {
      ...subcircuit.logicalInterface!,
      inputs: subcircuit.logicalInterface!.inputs.map((port, index) => index === 1
        ? { name: 'lhs', logicalType: { kind: 'bls12-381-fr' } as const }
        : port),
    }

    expect(() => placementManager.placeComposition('ADD', operands(UINT160_DATA_PT_TYPE))).not.toThrow()
  })

  it('rejects an incomplete host result without recording a placement', () => {
    const placementManager = createPlacementManager(UINT32_DATA_PT_TYPE, [])

    expect(() => placementManager.placeComposition('ADD', operands())).toThrow(
      'ALU3 produced 0 outputs, but its logical interface declares 1',
    )
    expect(placementManager.placements).toHaveLength(6)
  })
})
