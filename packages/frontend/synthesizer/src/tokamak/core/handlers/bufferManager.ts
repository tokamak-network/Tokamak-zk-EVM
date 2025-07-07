import {
  PRV_IN_PLACEMENT_INDEX,
  PUB_IN_PLACEMENT_INDEX,
  PRV_OUT_PLACEMENT_INDEX,
  PUB_OUT_PLACEMENT_INDEX,
} from '../../constant/index.js';
import { DataPointFactory } from '../../pointers/index.js';
import type { CreateDataPointParams, DataPt } from '../../types/index.js';
import type { ISynthesizerProvider } from './synthesizerProvider.js';
import type { StateManager } from './stateManager.js';

export class BufferManager {
  private synthesizerProvider: ISynthesizerProvider;
  private state: StateManager;

  constructor(
    synthesizerProvider: ISynthesizerProvider,
    stateManager: StateManager,
  ) {
    this.synthesizerProvider = synthesizerProvider;
    this.state = stateManager;
  }

  public addWireToInBuffer(inPt: DataPt, placementId: number): DataPt {
    if (
      !(
        placementId == PRV_IN_PLACEMENT_INDEX ||
        placementId == PUB_IN_PLACEMENT_INDEX
      )
    ) {
      throw new Error(`Synthesizer: Invalid use of buffers`);
    }
    // Use the length of existing output list as index for new output
    if (
      this.state.placements.get(placementId)!.inPts.length !==
      this.state.placements.get(placementId)!.outPts.length
    ) {
      throw new Error(
        `Synthesizer: Mismatch in the buffer wires (placement id: ${placementId})`,
      );
    }
    const outWireIndex = this.state.placements.get(placementId)!.outPts.length;
    // Create output data point
    const outPtRaw: CreateDataPointParams = {
      source: placementId,
      wireIndex: outWireIndex,
      value: inPt.value,
      sourceSize: inPt.sourceSize,
    };
    const outPt = DataPointFactory.create(outPtRaw);

    // Add input-output pair to the input buffer subcircuit
    this.state.placements.get(placementId)!.inPts.push(inPt);
    this.state.placements.get(placementId)!.outPts.push(outPt);

    return this.state.placements.get(placementId)!.outPts[outWireIndex];
  }

  public addWireToOutBuffer(
    inPt: DataPt,
    outPt: DataPt,
    placementId: number,
  ): void {
    if (
      !(
        placementId == PRV_OUT_PLACEMENT_INDEX ||
        placementId == PUB_OUT_PLACEMENT_INDEX
      )
    ) {
      throw new Error(`Synthesizer: Invalid use of buffers`);
    }
    // Use the length of existing output list as index for new output
    if (
      this.state.placements.get(placementId)!.inPts.length !==
        this.state.placements.get(placementId)!.outPts.length ||
      inPt.value !== outPt.value
    ) {
      throw new Error(
        `Synthesizer: Mismatches in the buffer wires (placement id: ${placementId})`,
      );
    }
    let outPtIdx = this.state.placements.get(placementId)!.outPts.length;
    if (outPt.wireIndex !== outPtIdx) {
      throw new Error(
        `Synthesizer: Invalid indexing in the output wire of an output buffer (placement id: ${placementId}, wire id: ${outPtIdx})`,
      );
    }
    // Add input-output pair to the output buffer subcircuit
    this.state.placements.get(placementId)!.inPts.push(inPt);
    this.state.placements.get(placementId)!.outPts.push(outPt);
  }
}
