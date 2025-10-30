import { DataPtFactory } from 'src/tokamak/core/synthesizer/dataStructure/dataPt.ts';
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
import { DEFAULT_SOURCE_BIT_SIZE } from 'src/tokamak/params/index.ts';
import { ArithmeticOperator, SubcircuitInfoByName, SubcircuitNames } from 'src/tokamak/interface/qapCompiler/configuredTypes.ts';
import { FIRST_ARITHMETIC_PLACEMENT_INDEX, subcircuitInfoByName } from 'src/tokamak/interface/qapCompiler/importedConstants.ts';

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

  public cachedStorage: Map<bigint, CachedStorageEntry> = new Map()
  public cachedEVMIn: Map<bigint, DataPt> = new Map()
  public cachedOrigin: DataPt | undefined = undefined
  public cachedReturnMemoryPts: MemoryPts = []

  public callMemoryPtsStack: MemoryPts[] = []

  constructor(parent: ISynthesizerProvider) {
    this.parent = parent
    this.cachedOpts = parent.cachedOpts
    this._initializeSubcircuitInfo()
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

  public loadStorage(key: bigint, value: bigint): DataPt {
    const cachedStorage = this.cachedStorage.get(key)
    
    if (cachedStorage === undefined) {
      // Cold storage access

      // Register the initial storage in STORAGE_IN buffer
      let valuePt: DataPt
      let indexPt: DataPt | null = null
      let keyPt: DataPt | null = null
      const MTIndex = this.cachedOpts.stateManager.getMTIndex(key)
      if (MTIndex >= 0) {
        indexPt = this.parent.addReservedVariableToBufferIn('IN_MT_INDEX', BigInt(MTIndex), true)
        keyPt = this.parent.addReservedVariableToBufferIn('IN_MPT_KEY', key, true)
        // const value = await stateManager.getStorage(
        //   this.cachedOpts.signedTransaction.to, 
        //   this.cachedOpts.stateManager.registeredKeys![MTIndex]
        // )
        valuePt = this.parent.addReservedVariableToBufferIn('IN_VALUE', value, true)
        // TODO: Verifiy Merkle proof
        const merkleTreeRootPt = this.parent.getReservedVariableFromBuffer('INI_MERKLE_ROOT')
        
      } else {
        valuePt = this.parent.addReservedVariableToBufferIn('OTHER_CONTRACT_STORAGE_IN', value, true)
      }
      // Cache the storage value pointer
      this.cachedStorage.set(key, {indexPt, keyPt, valuePt, access: 'Read'})
      return DataPtFactory.deepCopy(valuePt)
      
    } else {
      // Warm storage access
      return DataPtFactory.deepCopy(cachedStorage.valuePt)
    }
    
  }

  public storeStorage(key: bigint, symbolDataPt: DataPt): void {
    const cachedStorage = this.cachedStorage.get(key)
    if (cachedStorage === undefined) {
      const MTIndex = this.cachedOpts.stateManager.getMTIndex(key)
      if (MTIndex >= 0 ) {
        throw new Error('Storage writing at a user slot must be a warm access')
      } else {
        const valuePt = this.parent.addReservedVariableToBufferOut('OTHER_CONTRACT_STORAGE_OUT', symbolDataPt, true)
        this.cachedStorage.set(key, {indexPt: null, keyPt: null, valuePt, access: 'Write'})
      }
    } else {
      this.cachedStorage.set(key, {...cachedStorage, valuePt: symbolDataPt, access: 'Write'})
    }
  }
}
