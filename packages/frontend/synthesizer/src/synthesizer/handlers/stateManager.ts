import { DataPtFactory } from '../../synthesizer/dataStructure/dataPt.ts';
import {
  // BUFFER_PLACEMENT,
  ISynthesizerProvider,
  MemoryPts,
  PlacementEntry,
  placementsDeepCopy,
  type DataPt,
  type DataPtDescription,
  type Placements,
  type ReservedVariable,
  type SynthesizerOpts,
} from '../types/index.ts';
import { MemoryPt, StackPt } from '../dataStructure/index.ts';
import { SubcircuitInfoByName, SubcircuitNames } from '../../interface/qapCompiler/configuredTypes.ts';
import { subcircuitInfoByName } from '../../interface/qapCompiler/importedConstants.ts';
import { InterpreterStep, Message } from '@ethereumjs/evm';
import { Address, bytesToBigInt } from '@ethereumjs/util';

export type CachedStorageEntry = {
  addressIndex: number | null,
  indexPt: DataPt | null,
  keyPt: DataPt,
  valuePt: DataPt,
  access: 'Read' | 'Write'
}

export type ContextConstructionData = {
  callerPt: DataPt;
  toAddressPt: DataPt;
  callDataMemoryPts: MemoryPts;
}

export class ContextManager {
  public stackPt: StackPt;
  public memoryPt: MemoryPt;
  public callerPt: DataPt;
  public toAddressPt: DataPt;
  public returnDataMemoryPts: MemoryPts;
  public callDataMemoryPts: MemoryPts;
  public prevInterpreterStep: InterpreterStep | null;
  public resultMemoryPts: MemoryPts;

  constructor(data: ContextConstructionData) {
    this.stackPt = new StackPt();
    this.memoryPt = new MemoryPt();
    this.callerPt = data.callerPt;
    this.toAddressPt = data.toAddressPt;
    this.callDataMemoryPts = data.callDataMemoryPts;
    this.returnDataMemoryPts = [];
    this.prevInterpreterStep = null;
    this.resultMemoryPts = [];
  }
}

/**
 * Manages the state of the synthesizer, including placements, auxin, and subcircuit information.
 */
export class StateManager {
  private parent: ISynthesizerProvider
  private cachedOpts: SynthesizerOpts
  private _placements: Placements = []

  public verifiedStorageMTIndices: [number, number][] = [] // [ADDRESS_INDEX, LEAF_INDEX]
  public cachedStorage: Map<Address, Map<bigint, CachedStorageEntry[]>> = new Map() // Map<ADDRESS, Map<KEY, ENTRY>>
  public subcircuitInfoByName: SubcircuitInfoByName = subcircuitInfoByName;

  public cachedEVMIn: Map<bigint, DataPt> = new Map()
  public cachedOrigin: DataPt | undefined = undefined
  public cachedInitRoots: DataPt[] | undefined = undefined

  public currentDepth: number = 0;
  public contextByDepth: ContextManager[] = [];

  constructor(parent: ISynthesizerProvider) {
    this.parent = parent
    this.cachedOpts = parent.cachedOpts
  }

  public get placements(): Placements {
    // placements are protected and can be manipulated only by this.place and this.addWirePairToBufferIn
    return placementsDeepCopy(this._placements)
  }

  public place(
    name: SubcircuitNames,
    inPts: DataPt[],
    outPts: DataPt[],
    usage: string,
  ) {
    for (const inPt of inPts) {
      if (typeof inPt.source !== 'number') {
        throw new Error(
          `Synthesizer: Placing a subcircuit: Input wires to a new placement must be connected to the output wires of other placements.`,
        );
      }
    }
    const placement: PlacementEntry = {
      name,
      usage,
      subcircuitId: this.subcircuitInfoByName.get(name)!.id,
      inPts,
      outPts,
    };
    this._placements.push(placement);
  }

  public addWirePairToBufferIn(inPt: DataPt, outPt: DataPt, dynamic: boolean): DataPt {
    const thisPlacementId = outPt.source
    if (dynamic) {
      if (
        // double confirmation
        this._placements[thisPlacementId]!.inPts.length !== this._placements[thisPlacementId]!.outPts.length
        || this._placements[thisPlacementId]!.outPts.length !== outPt.wireIndex
      ) {
        throw new Error(
          `Synthesizer: Mismatch in the buffer wires (placement id: ${thisPlacementId})`
        );
      }
      // Add input-output pair to the input buffer subcircuit
      this._placements[thisPlacementId]!.inPts.push(inPt);
      this._placements[thisPlacementId]!.outPts.push(outPt);
    } else {
      this._placements[thisPlacementId]!.inPts[inPt.wireIndex] = inPt
      this._placements[thisPlacementId]!.outPts[outPt.wireIndex] = outPt
    }
    
    return DataPtFactory.deepCopy(outPt)
  }
}
