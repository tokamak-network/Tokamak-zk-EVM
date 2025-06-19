import {
  bigIntToBytes,
  bytesToHex,
  setLengthLeft,
} from '@synthesizer-libs/util';

import { setupParams } from '../../constant/index.js';
import {
  PRV_IN_PLACEMENT_INDEX,
  PRV_OUT_PLACEMENT_INDEX,
  PUB_IN_PLACEMENT_INDEX,
  PUB_OUT_PLACEMENT_INDEX,
} from '../../constant/index.js';

import type {
  DataPt,
  PlacementEntry,
  Placements,
  SubcircuitInfoByName,
  SubcircuitNames,
} from '../../types/index.js';
import type { Synthesizer } from '../synthesizer.js';
import { Permutation } from './permutation.js';
import { PlacementRefactor } from './placementRefactor.js';

export class Finalizer {
  private synthesizer: Synthesizer;

  constructor(synthesizer: Synthesizer) {
    this.synthesizer = synthesizer;
  }

  public async exec(
    _path?: string,
    writeToFS: boolean = true,
  ): Promise<Permutation> {
    const placementRefactor = new PlacementRefactor(this.synthesizer);
    const refactoriedPlacements = placementRefactor.refactor();
    const permutation = new Permutation(refactoriedPlacements, _path);
    permutation.placementVariables = await permutation.outputPlacementVariables(
      refactoriedPlacements,
      _path,
    );
    permutation.outputPermutation(_path);
    return permutation;
  }
}
