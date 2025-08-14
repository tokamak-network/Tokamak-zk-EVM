import type { StateManager } from '../handlers/stateManager.js';
import { Permutation } from './permutation.js';
import { PlacementRefactor } from './placementRefactor.js';

export class Finalizer {
  private state: StateManager;
  private qap_path: string;

  constructor(qap_path: string, stateManager: StateManager) {
    this.state = stateManager;
    this.qap_path = qap_path;
  }

  public async exec(
    writeToFS: boolean = true,
  ): Promise<Permutation> {
    const placementRefactor = new PlacementRefactor(this.state);
    const refactoriedPlacements = placementRefactor.refactor();
    const permutation = new Permutation(refactoriedPlacements, this.qap_path);
    permutation.placementVariables = await permutation.outputPlacementVariables(
      refactoriedPlacements,
      this.qap_path,
    );
    permutation.outputPermutation(this.qap_path);
    return permutation;
  }
}
