import { describe, expect, it } from 'vitest';

import { extractPublicProjection } from '../../../core/src/circuitGenerator/circuitGenerator.ts';

describe('public projection', () => {
  it('pads the complete free region to a power of two before fixed inputs', () => {
    const phases = [
      { name: 'user-output', region: 'free', subcircuitIds: [0] },
      { name: 'user-input', region: 'free', subcircuitIds: [1] },
      { name: 'block-input', region: 'free', subcircuitIds: [2] },
      { name: 'function-input', region: 'fixed', subcircuitIds: [3] },
    ] as const;
    const infos = phases.map((phase, id) => ({
      id,
      publicPhase: phase.name,
      Public_idx: [1, id === 0 || id === 2 ? 2 : 1],
    }));
    const placementVariables = infos.map(({ id, Public_idx }) => ({
      subcircuitId: id,
      variables: Array(Public_idx[0] + Public_idx[1]).fill('0x01'),
      instanceList: Array(Public_idx[0] + Public_idx[1]).fill(`phase-${id}`),
    }));
    const result = extractPublicProjection(
      placementVariables as never,
      {
        subcircuitLibrary: {
          data: { setupParams: { publicWirePhases: phases }, subcircuitInfo: infos },
        },
      } as never,
    );

    expect(result.publicInstance.a_pub_user).toHaveLength(3);
    expect(result.publicInstance.a_pub_block).toEqual(['0x01', '0x01', '0x00', '0x00', '0x00']);
    expect(result.publicInstance.a_pub_function).toEqual(['0x01']);
    expect(result.publicInstanceDescription.a_pub_block_description).toEqual([
      'phase-2', 'phase-2', '', '', '',
    ]);
  });
});
