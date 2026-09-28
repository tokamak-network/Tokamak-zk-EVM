import { describe, expect, it } from 'vitest';

import { parseFrontendConfig, parseSetupParams } from '../../../core/src/subcircuit/libraryData.ts';

const validConfig = {
  nTxIn: 6,
  nStorageLoad: 40,
  nLogOut: 50,
  nStorageStore: 30,
  nBlockIn: 24,
  nPrvIn: 80,
  nEVMIn: 530,
  nPrivateMessageInputs: 29,
  nPoseidonInputs: 2,
  nPoseidonBatch: 1,
  nPrevBlockHashes: 4,
};

describe('frontend configuration parsing', () => {
  it('preserves input-wire buffer capacities without conversion', () => {
    expect(parseFrontendConfig(validConfig)).toEqual(validConfig);
  });

  it('requires nBlockIn', () => {
    const { nBlockIn: _nBlockIn, ...missingBlockCapacity } = validConfig;

    expect(() => parseFrontendConfig(missingBlockCapacity)).toThrow(
      'Invalid values in frontendCfg.json: all keys must be finite numbers',
    );
  });

  it('rejects the retired Jubjub batch key', () => {
    expect(() => parseFrontendConfig({
      ...validConfig,
      nJubjubExpBatch: 37,
    })).toThrow('Unexpected key in frontendCfg.json: nJubjubExpBatch');
  });

  it('rejects setup metadata outside the normalized library contract', () => {
    expect(() => parseSetupParams({
      n: 16,
      m: 8,
      m_b: 8,
      t: 2,
      s: 8,
      publicWirePhases: [],
      globalWireList: [],
    })).toThrow('Unexpected key in setupParams.json: globalWireList');
  });
});
