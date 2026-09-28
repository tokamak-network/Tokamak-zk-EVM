import { describe, expect, it } from 'vitest';

import { parseSubcircuitInfo } from '../../../core/src/subcircuit/libraryData.ts';

const bufferEntry = (bufferDirection: unknown = undefined) => ({
  id: 0,
  name: 'bufferTxIn',
  Nwires: 4,
  NrealWires: 3,
  Nconsts: 2,
  Out_idx: [1, 1],
  In_idx: [2, 1],
  Wiring_idx: [0, 3],
  Public_idx: [2, 1],
  Internal_idx: [4, 0],
  publicPhase: 'user-input',
  ...(bufferDirection === undefined ? {} : { bufferDirection }),
});

const compositionEntry = (bufferDirection: unknown = undefined) => ({
  id: 1,
  name: 'ALU3',
  Nwires: 8,
  NrealWires: 8,
  Nconsts: 0,
  Out_idx: [1, 2],
  In_idx: [3, 5],
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
  ...(bufferDirection === undefined ? {} : { bufferDirection }),
});

describe('buffer direction metadata', () => {
  it('preserves a valid qap buffer direction', () => {
    expect(parseSubcircuitInfo([bufferEntry('in')])[0]!.bufferDirection).toBe('in');
  });

  it('rejects a buffer without a qap buffer direction', () => {
    expect(() => parseSubcircuitInfo([bufferEntry(undefined)])).toThrow(
      'bufferTxIn buffer must define bufferDirection',
    );
  });

  it('rejects an invalid qap buffer direction', () => {
    expect(() => parseSubcircuitInfo([bufferEntry('sideways')])).toThrow(
      'bufferTxIn buffer must define bufferDirection',
    );
  });

  it('rejects buffer direction metadata on a composition subcircuit', () => {
    expect(() => parseSubcircuitInfo([compositionEntry('out')])).toThrow(
      'ALU3 subcircuit must not define bufferDirection',
    );
  });
});
