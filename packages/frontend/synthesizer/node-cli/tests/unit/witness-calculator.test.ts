import { describe, expect, it } from 'vitest';

import { builder } from '../../../core/src/circuitGenerator/utils/witness_calculator.ts';
import { installedSubcircuitLibrary } from '../../src/subcircuit/installedLibrary.ts';

describe('witness calculator runtime', () => {
  it('instantiates a compiled subcircuit with the required runtime imports', async () => {
    const subcircuitId = installedSubcircuitLibrary.data.subcircuitInfo[0]!.id;
    const calculator = await builder(await installedSubcircuitLibrary.loadWasm(subcircuitId));

    expect(calculator).toBeDefined();
  });
});
