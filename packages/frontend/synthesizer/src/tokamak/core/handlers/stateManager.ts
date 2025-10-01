import { DataPtFactory } from 'src/tokamak/pointers/dataPointFactory.js';
import {
  DEFAULT_SOURCE_SIZE,
  FIRST_ARITHMETIC_PLACEMENT_INDEX,
  MAX_TX_NUMBER,
} from '../../constant/index.js';
import {
  ArithmeticOperator,
  BUFFER_PLACEMENT,
  PlacementEntry,
  VARIABLE_DESCRIPTION,
  type DataPt,
  type DataPtDescription,
  type L2TxData,
  type Placements,
  type ReservedBuffer,
  type ReservedVariable,
  type SubcircuitInfoByName,
  type SubcircuitNames,
  type SynthesizerOpts,
} from '../../types/index.js';
import { SubcircuitRegistry } from '../../utils/index.js';
import {jubjub} from '@noble/curves/misc';
import { bytesToBigInt } from '@synthesizer-libs/util';
import { AddressLike, bigIntToHex } from '@ethereumjs/util';
import { MemoryPt, MemoryPts, StackPt } from 'src/tokamak/pointers/index.ts';
import { ISynthesizerProvider } from './synthesizerProvider.ts';

/**
 * Manages the state of the synthesizer, including placements, auxin, and subcircuit information.
 */
export class StateManager {
  private parent: ISynthesizerProvider

  public stackPt: StackPt = new StackPt()
  public memoryPt: MemoryPt = new MemoryPt()
  public placements: Placements = new Map()
  public subcircuitInfoByName: SubcircuitInfoByName = new Map()
  public txNonce: number = -1
  public placementIndex: number = FIRST_ARITHMETIC_PLACEMENT_INDEX

  public cachedStorage: Map<bigint, {index: number, dataPt: DataPt}> = new Map()
  public cachedStaticIn: Map<bigint, DataPt> = new Map()
  public cachedOrigin: DataPt | undefined = undefined
  public cachedReturnMemoryPts: MemoryPts = []

  public callMemoryPtsStack: MemoryPts[] = []
  
  public lastMerkleRoot: bigint
  public subcircuitNames!: SubcircuitNames[]

  constructor(parent: ISynthesizerProvider, opts: SynthesizerOpts) {
    this.parent = parent
    this.lastMerkleRoot = opts.initMerkleTreeRoot
    this._initializeSubcircuitInfo()
  }

  public place(
    name: SubcircuitNames,
    inPts: DataPt[],
    outPts: DataPt[],
    usage: ArithmeticOperator,
  ) {
    if (!this.subcircuitNames.includes(name)) {
      throw new Error(`Subcircuit name ${name} is not defined`);
    }
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
    const { subcircuitInfoByName, subcircuitNames } =
      SubcircuitRegistry.createForStateManager();
    this.subcircuitInfoByName = subcircuitInfoByName;
    this.subcircuitNames = subcircuitNames;
  }

  public loadArbitraryStatic(
    value: bigint,
    bitSize?: number,
    desc?: string,
  ): DataPt {
    if (desc === undefined) {
      const cachedDataPt = this.cachedStaticIn.get(value)
      if (cachedDataPt !== undefined) {
        return cachedDataPt
      }
    }
    const placementIndex = BUFFER_PLACEMENT.STATIC_IN.placementIndex
    const inPtRaw: DataPtDescription = {
      extSource: desc ?? 'Arbitrary constant',
      sourceBitSize: bitSize ?? DEFAULT_SOURCE_SIZE * 8,
      source: placementIndex,
      wireIndex: this.placements.get(placementIndex)!.inPts.length,
    };
    const inPt = DataPtFactory.create(inPtRaw, value)
    const outPt = this.parent.addWireToInBuffer(inPt, placementIndex)
    this.parent.state.cachedStaticIn.set(value, outPt)
    return outPt
  }

  public loadStorage(key: bigint): DataPt {
    const cache = this.parent.state.cachedStorage.get(key)
    if (cache === undefined) {
      throw new Error(`Invalid access to the storage at an unregistered key "${bigIntToHex(key)}"`)
    }
    return cache.dataPt
  }

  public storeStorage(key: bigint, inPt: DataPt): void {
    const cache = this.parent.state.cachedStorage.get(key)
    if (cache === undefined) {
      throw new Error(`Invalid access to the storage at an unregistered key "${bigIntToHex(key)}"`)
    }
    this.parent.state.cachedStorage.set(key, {
      index: cache.index,
      dataPt: inPt,
    })
  }
}
