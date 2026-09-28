import { describe, expect, it } from 'vitest';

import { resolveSubcircuitLibraryData } from '../../../core/src/app/subcircuitLibrary.ts';
import { createTransactionInputVariables } from '../../../core/src/subcircuit/configuredTypes.ts';
import type { SubcircuitLibraryData } from '../../../core/src/subcircuit/libraryTypes.ts';
import { installedSubcircuitLibraryData } from '../../src/subcircuit/installedLibrary.ts';

const frontendCfg = {
  nTxIn: 3,
  nStorageLoad: 40,
  nLogOut: 50,
  nStorageStore: 30,
  nBlockIn: 24,
  nPrvIn: 80,
  nEVMIn: 500,
  nPrivateMessageInputs: 29,
  nPoseidonInputs: 2,
  nPoseidonBatch: 1,
  nPrevBlockHashes: 4,
} as const;

const setupParams = {
  n: 8,
  m: 8,
  m_b: 8,
  t: 2,
  s: 2,
  publicWirePhases: [],
} as const;

function createLibraryData(
  inputWireCount = 5,
  outputWireCount = 2,
): SubcircuitLibraryData {
  return {
    setupParams,
    frontendCfg: { ...frontendCfg },
    subcircuitInfo: [{
      id: 0,
      name: 'ALU3',
      Nwires: 8,
      NrealWires: 1 + inputWireCount + outputWireCount,
      Nconsts: 0,
      In_idx: [3, inputWireCount],
      Out_idx: [1, outputWireCount],
      Wiring_idx: [0, 8],
      Public_idx: [0, 0],
      Internal_idx: [8, 0],
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
    }],
  };
}

describe('logical-interface resolution', () => {
  it('accepts every declared composition step in the installed qap catalog', () => {
    expect(() => resolveSubcircuitLibraryData(
      installedSubcircuitLibraryData,
      async () => new ArrayBuffer(0),
    )).not.toThrow();
  });

  it('derives the reserved transaction-input boundary from qap-compiler metadata', () => {
    expect(createTransactionInputVariables(28)).toEqual(
      Array.from({ length: 28 }, (_, index) => `TRANSACTION_INPUT${index}`),
    );
  });

  it('rejects qap metadata whose input wire count disagrees with its interface', () => {
    expect(() => resolveSubcircuitLibraryData(createLibraryData(4), async () => new ArrayBuffer(0))).toThrow(
      'ALU3 logical interface declares 5 input wires, but qap-compiler provides 4',
    );
  });

  it('treats uint160 as one native field wire', () => {
    const data = createLibraryData(5, 2);
    data.subcircuitInfo[0]!.logicalInterface = {
      inputs: [
        { name: 'contractAddress', logicalType: { kind: 'uint', bits: 160 } },
        { name: 'lhs', logicalType: { kind: 'uint', bits: 256 } },
        { name: 'rhs', logicalType: { kind: 'uint', bits: 256 } },
      ],
      outputs: [
        { name: 'contractAddress', logicalType: { kind: 'uint', bits: 160 } },
      ],
    };
    expect(() => resolveSubcircuitLibraryData(data, async () => new ArrayBuffer(0))).toThrow(
      'ALU3 logical interface declares 1 output wires, but qap-compiler provides 2',
    );
  });
});
