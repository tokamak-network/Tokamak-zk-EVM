import {
  bigIntToBytes,
  bytesToHex,
  setLengthLeft,
} from '@synthesizer-libs/util';

import {
  BUFFER_PLACEMENT,
  setupParams,
} from '../../constant/index.js';
import type {
  DataPt,
  PlacementEntry,
  Placements,
  SubcircuitInfoByName,
  SubcircuitNames,
} from '../../types/index.js';
import type { StateManager } from '../synthesizer/handlers/stateManager.ts';

export class PlacementRefactor {
  private state: StateManager;

  constructor(stateManager: StateManager) {
    this.state = stateManager;
  }

  public refactor(): Placements {
    const placements = this.state.placements;
    const subcircuitInfoByName = this.state.subcircuitInfoByName;
    const dietLoadPlacment = this.removeUnusedLoadWires(placements);

    const { outPlacements, outWireIndexChangeTracker } =
      this._processOutputWires(
        placements,
        dietLoadPlacment,
        subcircuitInfoByName,
      );

    const finalPlacements = this._processInputWires(
      placements,
      dietLoadPlacment,
      outPlacements,
      outWireIndexChangeTracker,
    );

    this._validateBufferSizes(finalPlacements, subcircuitInfoByName);
    return finalPlacements;
  }

  private halveWordSizeOfWires(
    newDataPts: DataPt[],
    origDataPt: DataPt,
  ): number[] {
    const newIndex = newDataPts.length;
    const indLow = newIndex;
    const indHigh = indLow + 1;

    if (origDataPt.sourceSize > 255) { // 255 is the bit-length of bls12-381 modulus
      newDataPts[indLow] = { ...origDataPt };
      newDataPts[indLow].wireIndex = indLow;
      newDataPts[indHigh] = { ...origDataPt };
      newDataPts[indHigh].wireIndex = indHigh;

      newDataPts[indHigh].value = origDataPt.value >> 128n;
      newDataPts[indLow].value = origDataPt.value & (2n ** 128n - 1n);

      newDataPts[indHigh].valueHex = bytesToHex(
        setLengthLeft(bigIntToBytes(newDataPts[indHigh].value), 16),
      );
      newDataPts[indLow].valueHex = bytesToHex(
        setLengthLeft(bigIntToBytes(newDataPts[indLow].value), 16),
      );
      return [indLow, indHigh];
    } else {
      newDataPts[newIndex] = { ...origDataPt };
      newDataPts[newIndex].wireIndex = newIndex;
      return [newIndex];
    }
  }

  private removeUnusedLoadWires(placements: Placements): PlacementEntry {
    const staticInPlacementIndex = BUFFER_PLACEMENT.STATIC_IN.placementIndex
    const outLoadPlacement = { ...placements.get(staticInPlacementIndex)! };
    const newInPts = [...outLoadPlacement.inPts];
    const newOutPts = [...outLoadPlacement.outPts];
    for (let ind = 0; ind < outLoadPlacement.outPts.length; ind++) {
      let flag = 0;
      for (const key of placements.keys()) {
        if (key !== staticInPlacementIndex) {
          const placement = placements.get(key)!;
          for (const [_ind, _inPt] of placement.inPts.entries()) {
            if (
              _inPt.source! === staticInPlacementIndex &&
              _inPt.wireIndex === outLoadPlacement.outPts[ind].wireIndex
            ) {
              flag = 1;
              break;
            }
          }
        }
        if (flag) break;
      }
      if (!flag) {
        const arrayIdx = newOutPts.findIndex(
          (outPt) =>
            outPt.wireIndex! === outLoadPlacement.outPts[ind].wireIndex!,
        );
        newInPts.splice(arrayIdx, 1);
        newOutPts.splice(arrayIdx, 1);
      }
    }
    outLoadPlacement.inPts = newInPts;
    outLoadPlacement.outPts = newOutPts;
    return outLoadPlacement;
  }

  private _processOutputWires(
    placements: Placements,
    dietLoadPlacment: PlacementEntry,
    subcircuitInfoByName: SubcircuitInfoByName,
  ): {
    outPlacements: Placements;
    outWireIndexChangeTracker: Map<number, Map<number, number[]>>;
  } {
    const outPlacements: Placements = new Map();
    const outWireIndexChangeTracker: Map<
      number,
      Map<number, number[]>
    > = new Map();

    for (const key of placements.keys()) {
      const _wireIndexTracker: Map<number, number[]> = new Map();
      const placement =
        key === PRV_IN_PLACEMENT_INDEX ? dietLoadPlacment : placements.get(key);

      const newOutPts: DataPt[] = [];
      const outPts = placement!.outPts;

      for (const outPt of outPts) {
        const newInd = this.halveWordSizeOfWires(newOutPts, outPt);
        _wireIndexTracker.set(outPt.wireIndex, newInd);
      }
      outWireIndexChangeTracker.set(key, _wireIndexTracker);

      outPlacements.set(key, {
        name: placement!.name,
        usage: placement!.usage,
        subcircuitId: subcircuitInfoByName.get(
          placement!.name as SubcircuitNames,
        )!.id,
        inPts: placement!.inPts,
        outPts: [...newOutPts],
      });
    }
    return { outPlacements, outWireIndexChangeTracker };
  }

  private _processInputWires(
    placements: Placements,
    dietLoadPlacment: PlacementEntry,
    outPlacements: Placements,
    outWireIndexChangeTracker: Map<number, Map<number, number[]>>,
  ) {
    for (const key of placements.keys()) {
      const placement =
        key === PRV_IN_PLACEMENT_INDEX ? dietLoadPlacment : placements.get(key);

      const newInPts: DataPt[] = [];
      const inPts = placement!.inPts;

      for (const inPt of inPts) {
        const newInd = this.halveWordSizeOfWires(newInPts, inPt);
        const oldRefSource = inPt.source;
        const oldRefWireInd = inPt.wireIndex;
        if (oldRefSource !== key) {
          // console.log(`curr source, target source = (${key}, ${oldRefSource})`)
          const newRefWireIndices = outWireIndexChangeTracker
            .get(oldRefSource)!
            .get(oldRefWireInd)!;
          for (const [i, newRefWireInd] of newRefWireIndices.entries()) {
            newInPts[newInd[i]!].wireIndex = newRefWireInd;
          }
        }
      }

      outPlacements.get(key)!.inPts = [...newInPts];
    }
    return outPlacements;
  }

  private _validateBufferSizes(
    outPlacements: Placements,
    subcircuitInfoByName: SubcircuitInfoByName,
  ) {
    const flags: boolean[] = Array(5).fill(true);

    if (
      outPlacements.get(PRV_IN_PLACEMENT_INDEX)!.inPts.length >
      subcircuitInfoByName.get('bufferPrvIn' as SubcircuitNames)!.NInWires
    ) {
      flags[0] = false;
      console.log(
        `Error: Synthesizer: Insufficient private input buffer length. Ask the qap-compiler for a longer buffer (required length: ${
          outPlacements.get(PRV_IN_PLACEMENT_INDEX)!.inPts.length
        }).`,
      );
    }
    if (
      outPlacements.get(PRV_OUT_PLACEMENT_INDEX)!.outPts.length >
      subcircuitInfoByName.get('bufferPrvOut' as SubcircuitNames)!.NOutWires
    ) {
      flags[1] = false;
      console.log(
        `Error: Synthesizer: Insufficient private output buffer length. Ask the qap-compiler for a longer buffer (required length: ${
          outPlacements.get(PRV_OUT_PLACEMENT_INDEX)!.outPts.length
        }).`,
      );
    }
    if (
      outPlacements.get(PUB_IN_PLACEMENT_INDEX)!.inPts.length >
      subcircuitInfoByName.get('bufferPubIn' as SubcircuitNames)!.NInWires
    ) {
      flags[2] = false;
      console.log(
        `Error: Synthesizer: Insufficient public input buffer length. Ask the qap-compiler for a longer buffer (required length: ${
          outPlacements.get(PUB_IN_PLACEMENT_INDEX)!.inPts.length
        }).`,
      );
    }
    if (
      outPlacements.get(PUB_OUT_PLACEMENT_INDEX)!.outPts.length >
      subcircuitInfoByName.get('bufferPubOut' as SubcircuitNames)!.NOutWires
    ) {
      flags[3] = false;
      console.log(
        `Error: Synthesizer: Insufficient public output buffer length. Ask the qap-compiler for a longer buffer (required length: ${
          outPlacements.get(PUB_OUT_PLACEMENT_INDEX)!.outPts.length
        }).`,
      );
    }
    if (outPlacements.size > setupParams.s_max) {
      flags[4] = false;
      console.log(
        `Error: Synthesizer: The number of placements exceeds the parameter s_max. Ask the qap-compiler for more placements (required slots: ${outPlacements.size})`,
      );
    }
    if (flags.includes(false)) {
      throw new Error('Resolve above errors.');
    }
  }
}
