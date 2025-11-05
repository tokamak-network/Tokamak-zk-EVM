import { DataPtFactory } from 'src/synthesizer/dataStructure/dataPt.ts';
import {
  // BUFFER_PLACEMENT,
  ISynthesizerProvider,
  MemoryPts,
  PlacementEntry,
  placementsDeepCopy,
  VARIABLE_DESCRIPTION,
  type DataPt,
  type DataPtDescription,
  type Placements,
  type ReservedVariable,
  type SynthesizerOpts,
} from '../types/index.ts';
import {jubjub} from '@noble/curves/misc';
import { AddressLike, bigIntToHex, bytesToBigInt, equalsBytes } from '@ethereumjs/util';
import { MemoryPt, StackPt } from '../dataStructure/index.ts';
import { DEFAULT_SOURCE_BIT_SIZE, poseidon_raw } from 'src/synthesizer/params/index.ts';
import { ArithmeticOperator, BUFFER_LIST, SubcircuitInfoByName, SubcircuitNames } from 'src/interface/qapCompiler/configuredTypes.ts';
import { FIRST_ARITHMETIC_PLACEMENT_INDEX, MT_DEPTH, POSEIDON_INPUTS, subcircuitInfoByName } from 'src/interface/qapCompiler/importedConstants.ts';
import { TokamakL2StateManager } from 'src/TokamakL2JS/index.ts';
import { IMT, IMTMerkleProof } from '@zk-kit/imt';
import { ArithmeticOperations } from '../dataStructure/arithmeticOperations.ts';

type CachedStorageEntry = {
  indexPt: DataPt | null,
  keyPt: DataPt | null,
  valuePt: DataPt,
  access: 'Read' | 'Write'
}

/**
 * Manages the state of the synthesizer, including placements, auxin, and subcircuit information.
 */
export class StateManager {
  private parent: ISynthesizerProvider
  private cachedOpts: SynthesizerOpts
  private _placements: Placements = []

  public stackPt: StackPt = new StackPt()
  public memoryPt: MemoryPt = new MemoryPt()
  public subcircuitInfoByName: SubcircuitInfoByName = new Map()
  public placementIndex: number = FIRST_ARITHMETIC_PLACEMENT_INDEX

  public cachedStorage: Map<bigint, CachedStorageEntry[]> = new Map()
  public cachedEVMIn: Map<bigint, DataPt> = new Map()
  public cachedOrigin: DataPt | undefined = undefined
  public cachedReturnMemoryPts: MemoryPts = []
  public cachedMerkleTreeRoot: bigint | undefined = undefined

  public callMemoryPtsStack: MemoryPts[] = []

  constructor(parent: ISynthesizerProvider) {
    this.parent = parent
    this.cachedOpts = parent.cachedOpts
    this._initializeSubcircuitInfo()
    for (const key of this.cachedOpts.stateManager.registeredKeys!) {
      this.cachedStorage.set(bytesToBigInt(key), [])
    }
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

  /**
   * Processes the raw subcircuit data to initialize `subcircuitInfoByName` and `subcircuitNames`.
   */
  private _initializeSubcircuitInfo(): void {
    this.subcircuitInfoByName = subcircuitInfoByName;
  }
}
