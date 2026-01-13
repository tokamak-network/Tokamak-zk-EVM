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
import { FIRST_ARITHMETIC_PLACEMENT_INDEX, subcircuitInfoByName } from '../../interface/qapCompiler/importedConstants.ts';

export type CachedStorageEntry = {
  indexPt: DataPt | null,
  keyPt: DataPt,
  valuePt: DataPt,
  access: 'Read' | 'Write'
}

/**
 * Manages the state of the synthesizer, including placements, auxin, and subcircuit information.
 */
export class StateManager {
  // Synthesizer cache
  private parent: ISynthesizerProvider
  private cachedOpts: SynthesizerOpts
  private _placements: Placements = []
  public transactionHashes: DataPt[] = []
  public subcircuitInfoByName: SubcircuitInfoByName = new Map()
  public placementIndex: number = FIRST_ARITHMETIC_PLACEMENT_INDEX
  public transactionIndex: number | null = null;
  public cachedEVMIn: Map<bigint, DataPt> = new Map()

  // VM cache
  public verifiedStorageMTIndices: number[] = [] 
  public cachedStorage: Map<bigint, CachedStorageEntry[]> = new Map()

  // Interpreter cache
  public stackPt: StackPt = new StackPt()
  public memoryPt: MemoryPt = new MemoryPt()
  public cachedOrigin: DataPt | undefined = undefined
  public cachedCallers: DataPt[] = []
  public cachedToAddress: DataPt | undefined = undefined
  public cachedReturnMemoryPts: MemoryPts = []
  public callMemoryPtsStack: MemoryPts[] = []

  

  constructor(parent: ISynthesizerProvider) {
    this.parent = parent
    this.cachedOpts = parent.cachedOpts
    this._initializeSubcircuitInfo();
    this.clearInterpreterCache();
  }

  public get placements(): Placements {
    // placements are protected and can be manipulated only by this.place and this.addWirePairToBufferIn
    return placementsDeepCopy(this._placements)
  }

  // public getCachedStorage(key: bigint): CachedStorageEntry | undefined {
  //   return this._cachedStorage.get(key)
  // }

  // public setCachedStorage(key: bigint, entry: AccessHistoryEntry, isVerified: boolean) {
  //   const MTIndex = this.cachedOpts.stateManager.getMTIndex(key);
  //   const isRegistered = MTIndex >= 0 ? true : false;
  //   const cached = this._cachedStorage.get(key);
  //   const isColdAccess = cached === undefined ? true : false;
  //   const isReadAccess = entry.access === "Read" ? true : false;
  //   const history: AccessHistoryEntry[] = [];
  //   if ( !isColdAccess ) {
  //     history.push(...cached!.accessHistory, entry);
  //   } else {
  //     history.push(entry);
  //   }
  //   let verifiedOrder: number | null = null;
  //   if (isReadAccess) {
  //     if (isWarmAccess)
  //   } else {
  //     verifiedOrder = null;
  //   }
  //   if (isVerified) {
  //     verifiedOrder = this._nextStorageVerifiedOrder++;
  //   } else {
  //     if (!isRegistered) {
  //       verifiedOrder = null;
  //     } else {
  //       if (isColdAccess) {
  //         if (isReadAccess) {
  //           throw new Error('Every cold read access to storage must be verified.')
  //         } else {
  //           verifiedOrder = null;
  //         }
  //       } else {

  //       }
  //     }
  //   }

  //   verifiedOrder = isVerified ? this._nextStorageVerifiedOrder++ : null;
  //   this._cachedStorage.set(key, {
  //     verifiedOrder,
  //     accessHistory: history,
  //   })
  // }

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

  public addWirePairToBufferIn(inPt: DataPt, outPt: DataPt, dynamic: boolean = false): DataPt {
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

  public clearInterpreterCache(): void {
    this.stackPt = new StackPt();
    this.memoryPt = new MemoryPt();
    this.cachedOrigin = undefined;
    this.cachedCallers = [];
    this.cachedToAddress = undefined;
    this.cachedReturnMemoryPts = [];
    this.callMemoryPtsStack = [];
  }

  /**
   * Processes the raw subcircuit data to initialize `subcircuitInfoByName` and `subcircuitNames`.
   */
  private _initializeSubcircuitInfo(): void {
    this.subcircuitInfoByName = subcircuitInfoByName;
  }
}
