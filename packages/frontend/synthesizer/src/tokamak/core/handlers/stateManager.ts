import { DataPtFactory } from 'src/tokamak/pointers/dataPointFactory.js';
import {
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
import { AddressLike } from '@ethereumjs/util';
import { MemoryPt, StackPt } from 'src/tokamak/pointers/index.ts';
import { ISynthesizerProvider } from './synthesizerProvider.ts';

/**
 * Manages the state of the synthesizer, including placements, auxin, and subcircuit information.
 */
export class StateManager {
  public stackPt: StackPt = new StackPt()
  public memoryPt: MemoryPt = new MemoryPt()
  
  public placements: Placements = new Map()
  public cachedStaticIn: Map<bigint, DataPt> = new Map()
  public cachedStorage: Map<string, DataPt> = new Map()
  public subcircuitInfoByName: SubcircuitInfoByName = new Map()
  public cachedOrigin: DataPt | undefined = undefined
  public txNonce: number = -1
  public placementIndex: number = FIRST_ARITHMETIC_PLACEMENT_INDEX
  public cachedCalldataMemoryPt: MemoryPt | undefined = undefined
  
  public lastMerkleRoot: bigint
  public subcircuitNames!: SubcircuitNames[]

  constructor(opts: SynthesizerOpts) {
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
}
