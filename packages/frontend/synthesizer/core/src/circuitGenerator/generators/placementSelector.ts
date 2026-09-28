import type { ResolvedSubcircuitLibrary } from '../../subcircuit/libraryTypes.ts';
import type { Placements, PlacementVariables } from '../../synthesizer/types/placements.ts';

export const INACTIVE_PLACEMENT_SELECTOR_ENTRY = -1;

/**
 * Capacity-length placement selector kappa used by the univariate protocol.
 *
 * Each active entry is a subcircuit ID. `INACTIVE_PLACEMENT_SELECTOR_ENTRY`
 * marks an unused placement capacity slot.
 */
export type PlacementSelector = readonly number[];

export function derivePlacementSelector(
  placements: Placements,
  placementVariables: PlacementVariables,
  subcircuitLibrary: ResolvedSubcircuitLibrary,
): PlacementSelector {
  const { setupParams, subcircuitInfo } = subcircuitLibrary.data;
  const sMax = setupParams.s;
  if (!Number.isSafeInteger(sMax) || sMax < 0 || sMax > 0xffff_ffff) {
    throw new Error('Selector capacity s must be a non-negative u32');
  }
  if (placements.length > sMax) {
    throw new Error(`Selector has ${placements.length} placements but capacity is ${sMax}`);
  }
  if (placements.length !== placementVariables.length) {
    throw new Error(
      `Selector cannot align ${placements.length} placements with ${placementVariables.length} placement-variable entries`,
    );
  }

  const librarySubcircuitIds = new Set(subcircuitInfo.map((entry) => entry.id));
  const selector = Array<number>(sMax).fill(INACTIVE_PLACEMENT_SELECTOR_ENTRY);
  for (const [placementIndex, placement] of placements.entries()) {
    const subcircuitId = placement.subcircuitId;
    if (
      !Number.isSafeInteger(subcircuitId)
      || subcircuitId < 0
      || subcircuitId > 0x7fff_ffff
    ) {
      throw new Error(`Selector placement ${placementIndex} has an invalid active subcircuit ID`);
    }
    if (!librarySubcircuitIds.has(subcircuitId)) {
      throw new Error(`Selector placement ${placementIndex} references unavailable subcircuit ID ${subcircuitId}`);
    }
    if (placementVariables[placementIndex]!.subcircuitId !== subcircuitId) {
      throw new Error(`Selector placement ${placementIndex} does not match its placement-variable subcircuit ID`);
    }
    selector[placementIndex] = subcircuitId;
  }

  const selectedSubcircuitIds = selector.filter(
    (subcircuitId) => subcircuitId !== INACTIVE_PLACEMENT_SELECTOR_ENTRY,
  );
  if (
    selectedSubcircuitIds.length !== placementVariables.length
    || selectedSubcircuitIds.some(
      (subcircuitId, placementIndex) =>
        subcircuitId !== placementVariables[placementIndex]!.subcircuitId,
    )
  ) {
    throw new Error('Selector active entries do not match placement-variable scan order');
  }

  const publicBufferIds = subcircuitInfo
    .filter(entry => entry.Public_idx[1] > 0)
    .map(entry => entry.id)
    .sort((left, right) => left - right);
  for (const [bufferIndex, subcircuitId] of publicBufferIds.entries()) {
    if (subcircuitId !== bufferIndex) {
      throw new Error('Public buffer IDs must form the canonical zero-based prefix');
    }
    if (selector[bufferIndex] !== subcircuitId) {
      throw new Error(
        `Public buffer ${subcircuitId} must occupy its matching placement index ${bufferIndex}`,
      );
    }
    if (selector.filter((entry) => entry === subcircuitId).length !== 1) {
      throw new Error(`Public buffer ${subcircuitId} must have exactly one placement`);
    }
  }

  return selector;
}
