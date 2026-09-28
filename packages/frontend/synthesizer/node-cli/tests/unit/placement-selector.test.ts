import { describe, expect, it } from 'vitest';

import {
  derivePlacementSelector,
  INACTIVE_PLACEMENT_SELECTOR_ENTRY,
} from '../../../core/src/circuitGenerator/generators/placementSelector.ts';
import { createSynthesisOutputJsonFiles } from '../../../core/src/app/serialization.ts';
import type { Placements, PlacementVariables } from '../../../core/src/synthesizer/types/placements.ts';

const placement = (subcircuitId: number) => ({ subcircuitId }) as Placements[number];
const variables = (subcircuitId: number) => ({
  subcircuitId,
  variables: [],
  instanceList: [],
});

const library = (
  sMax: number,
  publicSubcircuitIds: readonly number[],
  ids: readonly number[],
) => ({
  data: {
    setupParams: { s: sMax },
    subcircuitInfo: ids.map((id) => ({ id, Public_idx: [0, publicSubcircuitIds.includes(id) ? 1 : 0] })),
  },
}) as never;

describe('placement selector', () => {
  it('uses only -1 for unused slots and rejects noncompiled active IDs', () => {
    expect(derivePlacementSelector([], [], library(2, [], [0]))).toEqual([-1, -1]);
    for (const id of [-1, -2, 0xffff_ffff, 3]) {
      expect(() => derivePlacementSelector([placement(id)], [variables(id)], library(2, [], [0])))
        .toThrow();
    }
  });
  it('uses capacity length and preserves an inactive non-buffer slot', () => {
    const placements = [placement(0), placement(1), placement(2), placement(9)];
    const placementVariables = placements.map(({ subcircuitId }) => variables(subcircuitId));

    expect(derivePlacementSelector(
      placements,
      placementVariables,
      library(6, [0, 1, 2], [0, 1, 2, 9]),
    )).toEqual([
      0,
      1,
      2,
      9,
      INACTIVE_PLACEMENT_SELECTOR_ENTRY,
      INACTIVE_PLACEMENT_SELECTOR_ENTRY,
    ]);
  });

  it('rejects a placement-variable mismatch', () => {
    const placements = [placement(0), placement(1), placement(2), placement(9)];
    const placementVariables: PlacementVariables = [variables(0), variables(1), variables(2), variables(8)];

    expect(() => derivePlacementSelector(
      placements,
      placementVariables,
      library(4, [0, 1, 2], [0, 1, 2, 8, 9]),
    )).toThrow('does not match its placement-variable subcircuit ID');
  });

  it('rejects a public buffer outside its matching canonical slot', () => {
    const placements = [placement(0), placement(9), placement(2), placement(1)];
    const placementVariables = placements.map(({ subcircuitId }) => variables(subcircuitId));

    expect(() => derivePlacementSelector(
      placements,
      placementVariables,
      library(4, [0, 1, 2], [0, 1, 2, 9]),
    )).toThrow('Public buffer 1 must occupy its matching placement index 1');
  });

  it('does not impose the public-buffer placement rule on non-public wires', () => {
    const placements = [placement(0), placement(9), placement(2), placement(1)];
    const placementVariables = placements.map(({ subcircuitId }) => variables(subcircuitId));

    expect(derivePlacementSelector(
      placements,
      placementVariables,
      library(4, [0], [0, 1, 2, 9]),
    )).toEqual([0, 9, 2, 1]);
  });

  it('serializes the selector as a primary JSON array', () => {
    const files = createSynthesisOutputJsonFiles({
      selector: [0, INACTIVE_PLACEMENT_SELECTOR_ENTRY],
    } as never);

    expect(JSON.parse(files['selector.json']!)).toEqual([0, INACTIVE_PLACEMENT_SELECTOR_ENTRY]);
  });
});
