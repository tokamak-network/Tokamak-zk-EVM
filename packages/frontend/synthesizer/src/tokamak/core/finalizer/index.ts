import type { StateManager } from '../handlers/stateManager.js';
import { Permutation } from './permutation.js';
import { PlacementRefactor } from './placementRefactor.js';

export class Finalizer {
  private state: StateManager;

  constructor(stateManager: StateManager) {
    this.state = stateManager;
  }

  public async exec(
    _path?: string,
    writeToFS: boolean = true,
  ): Promise<Permutation> {
    const placementRefactor = new PlacementRefactor(this.state);
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
