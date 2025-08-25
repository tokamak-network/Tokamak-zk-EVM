import {
  INITIAL_PLACEMENT_INDEX,
  STATE_IN_PLACEMENT,
  STATE_IN_PLACEMENT_INDEX,
  STATE_OUT_PLACEMENT,
  STATE_OUT_PLACEMENT_INDEX,
  STATIC_IN_PLACEMENT,
  STATIC_IN_PLACEMENT_INDEX,
  TRANSACTION_IN_PLACEMENT,
  TRANSACTION_IN_PLACEMENT_INDEX,
} from '../../constant/index.js';
import type {
  Auxin,
  DataPt,
  Placements,
  SubcircuitInfoByName,
  SubcircuitNames,
} from '../../types/index.js';
import { SubcircuitRegistry } from '../../utils/index.js';

/**
 * Manages the state of the synthesizer, including placements, auxin, and subcircuit information.
 */
export class StateManager {
  public placements!: Placements;
  public auxin!: Auxin;
  public envInf!: Map<string, { value: bigint; wireIndex: number }>;
  public blkInf!: Map<string, { value: bigint; wireIndex: number }>;
  public storagePt!: Map<string, DataPt>;
  public logPt!: { topicPts: DataPt[]; valPts: DataPt[] }[];
  public keccakPt!: { inValues: bigint[]; outValue: bigint }[];
  public TStoragePt!: Map<string, Map<bigint, DataPt>>;
  public placementIndex!: number;
  public subcircuitInfoByName!: SubcircuitInfoByName;
  public subcircuitNames!: SubcircuitNames[];
  public isTxVerified!: boolean

  constructor() {
    this._initializeState();
    this._initializeSubcircuitInfo();
    this._initializePlacements();
    this.placementIndex = INITIAL_PLACEMENT_INDEX;
  }

  /**
   * Returns the current placement index and then increments it.
   * @returns {number} The current placement index before incrementing.
   */
  public getNextPlacementIndex(): number {
    return this.placementIndex++;
  }

  /**
   * Initializes maps and arrays for storing synthesizer state.
   */
  private _initializeState(): void {
    this.auxin = new Map();
    this.envInf = new Map();
    this.blkInf = new Map();
    this.storagePt = new Map();
    this.logPt = [];
    this.keccakPt = [];
    this.TStoragePt = new Map();
    this.placements = new Map();
    this.subcircuitInfoByName = new Map();
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

  /**
   * Initializes the default placements for public/private inputs and outputs.
   */
  private _initializePlacements(): void {
    const initialPlacements = [
      { index: STATE_IN_PLACEMENT_INDEX, data: STATE_IN_PLACEMENT },      //input public
      { index: STATE_OUT_PLACEMENT_INDEX, data: STATE_OUT_PLACEMENT },    //output public
      { index: STATIC_IN_PLACEMENT_INDEX, data: STATIC_IN_PLACEMENT },    //input public          //input public
      { index: TRANSACTION_IN_PLACEMENT_INDEX, data: TRANSACTION_IN_PLACEMENT }, //private
    ];

    for (const p of initialPlacements) {
      const subcircuitInfo = this.subcircuitInfoByName.get(p.data.name);
      if (!subcircuitInfo) {
        throw new Error(
          `StateManager: Could not find subcircuit info for placement '${p.data.name}'`,
        );
      }

      this.placements.set(p.index, {
        ...p.data,
        subcircuitId: subcircuitInfo.id,
      });
    }
  }
}
