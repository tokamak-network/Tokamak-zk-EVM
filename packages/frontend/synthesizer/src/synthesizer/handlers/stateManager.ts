import { DataPtFactory } from 'src/synthesizer/dataStructure/dataPt.ts';
import {
  BUFFER_PLACEMENT,
  ISynthesizerProvider,
  MemoryPts,
  PlacementEntry,
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
import { ArithmeticOperator, SubcircuitInfoByName, SubcircuitNames } from 'src/interface/qapCompiler/configuredTypes.ts';
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

  public stackPt: StackPt = new StackPt()
  public memoryPt: MemoryPt = new MemoryPt()
  public placements: Placements = new Map()
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

  public place(
    name: SubcircuitNames,
    inPts: DataPt[],
    outPts: DataPt[],
    usage: ArithmeticOperator,
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
    this.placements.set(this.getNextPlacementIndex(), placement);
  }

  /**
   * Returns the current placement index and then increments it.
   * @returns {number} The current placement index before incrementing.
   */
  public getNextPlacementIndex(): number {
    return this.placementIndex++;
  }

  /**
   * Processes the raw subcircuit data to initialize `subcircuitInfoByName` and `subcircuitNames`.
   */
  private _initializeSubcircuitInfo(): void {
    this.subcircuitInfoByName = subcircuitInfoByName;
  }

  public loadArbitraryStatic(
    value: bigint,
    bitSize?: number,
    desc?: string,
  ): DataPt {
    if (desc === undefined) {
      const cachedDataPt = this.cachedEVMIn.get(value)
      if (cachedDataPt !== undefined) {
        return DataPtFactory.deepCopy(cachedDataPt)
      }
    }
    const placementIndex = BUFFER_PLACEMENT.EVM_IN.placementIndex
    const inPtRaw: DataPtDescription = {
      extSource: desc ?? 'Arbitrary constant',
      sourceBitSize: bitSize ?? DEFAULT_SOURCE_BIT_SIZE * 8,
      source: placementIndex,
      wireIndex: this.placements.get(placementIndex)!.inPts.length,
    };
    const inPt = DataPtFactory.create(inPtRaw, value)
    const outPt = DataPtFactory.createBufferTwin(inPt)
    this.parent.addWirePairToBufferIn(inPt, outPt, true)
    this.parent.state.cachedEVMIn.set(value, outPt)
    return DataPtFactory.deepCopy(outPt)
  }
}
