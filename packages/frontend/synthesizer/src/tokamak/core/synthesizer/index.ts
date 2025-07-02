import {
  DEFAULT_SOURCE_SIZE,
  PRV_IN_PLACEMENT_INDEX,
} from '../../constant/index.js';
import { DataAliasInfos, MemoryPts } from '../../pointers/index.js';
import type {
  ArithmeticOperator,
  CreateDataPointParams,
  DataPt,
  SubcircuitNames,
} from '../../types/index.js';
import type { PlacementEntry } from '../../types/synthesizer.js';
import { StateManager } from '../handlers/stateManager.js';
import { OperationHandler } from '../handlers/operationHandler.js';
import { DataLoader } from '../handlers/dataLoader.js';
import { MemoryManager } from '../handlers/memoryManager.js';
import { BufferManager } from '../handlers/bufferManager.js';
import type { ISynthesizerProvider } from '../handlers/synthesizerProvider.js';
import type { IDataLoaderProvider } from '../handlers/dataLoaderProvider.js';
import type { IMemoryManagerProvider } from '../handlers/memoryManagerProvider.js';
import { DataPointFactory } from '../../pointers/dataPointFactory.js';

/**
 * The Synthesizer class manages data related to subcircuits.
 * It acts as a facade, delegating tasks to various handler classes.
 */
export class Synthesizer
  implements ISynthesizerProvider, IDataLoaderProvider, IMemoryManagerProvider
{
  private _state: StateManager;
  private operationHandler: OperationHandler;
  private dataLoader: DataLoader;
  private memoryManager: MemoryManager;
  private bufferManager: BufferManager;

  constructor() {
    this._state = new StateManager();
    this.operationHandler = new OperationHandler(this, this._state);
    this.dataLoader = new DataLoader(this, this._state);
    this.memoryManager = new MemoryManager(this, this._state);
    this.bufferManager = new BufferManager(this, this._state);
  }

  public get state(): StateManager {
    return this._state;
  }

  public addWireToInBuffer(inPt: DataPt, placementId: number): DataPt {
    return this.bufferManager.addWireToInBuffer(inPt, placementId);
  }

  public addWireToOutBuffer(
    inPt: DataPt,
    outPt: DataPt,
    placementId: number,
  ): void {
    this.bufferManager.addWireToOutBuffer(inPt, outPt, placementId);
  }

  public loadPUSH(
    codeAddress: string,
    programCounter: number,
    value: bigint,
    size: number,
  ): DataPt {
    return this.dataLoader.loadPUSH(codeAddress, programCounter, value, size);
  }

  public loadAuxin(value: bigint, size?: number): DataPt {
    const sourceSize = size ?? DEFAULT_SOURCE_SIZE;
    if (this._state.auxin.has(value)) {
      return this._state.placements.get(PRV_IN_PLACEMENT_INDEX)!.outPts[
        this._state.auxin.get(value)!
      ];
    }
    const inPtRaw: CreateDataPointParams = {
      extSource: 'auxin',
      source: PRV_IN_PLACEMENT_INDEX,
      wireIndex: this._state.placements.get(PRV_IN_PLACEMENT_INDEX)!.inPts
        .length,
      value,
      sourceSize,
    };
    const inPt = DataPointFactory.create(inPtRaw);
    const outPt = this.addWireToInBuffer(inPt, PRV_IN_PLACEMENT_INDEX);
    this._state.auxin.set(value, outPt.wireIndex!);
    return outPt;
  }

  public loadEnvInf(
    codeAddress: string,
    type: string,
    value: bigint,
    _offset?: number,
    size?: number,
  ): DataPt {
    return this.dataLoader.loadEnvInf(codeAddress, type, value, _offset, size);
  }

  public loadStorage(codeAddress: string, key: bigint, value: bigint): DataPt {
    return this.dataLoader.loadStorage(codeAddress, key, value);
  }

  public storeStorage(codeAddress: string, key: bigint, inPt: DataPt): void {
    this.dataLoader.storeStorage(codeAddress, key, inPt);
  }

  public storeLog(valPts: DataPt[], topicPts: DataPt[]): void {
    this.dataLoader.storeLog(valPts, topicPts);
  }

  public loadBlkInf(blkNumber: bigint, type: string, value: bigint): DataPt {
    return this.dataLoader.loadBlkInf(blkNumber, type, value);
  }

  public loadAndStoreKeccak(
    inPts: DataPt[],
    outValue: bigint,
    length: bigint,
  ): DataPt {
    return this.dataLoader.loadAndStoreKeccak(inPts, outValue, length);
  }

  public placeMSTORE(dataPt: DataPt, truncSize: number): DataPt {
    return this.memoryManager.placeMSTORE(dataPt, truncSize);
  }

  public placeMemoryToStack(dataAliasInfos: DataAliasInfos): DataPt {
    return this.memoryManager.placeMemoryToStack(dataAliasInfos);
  }

  public placeMemoryToMemory(dataAliasInfos: DataAliasInfos): DataPt[] {
    return this.memoryManager.placeMemoryToMemory(dataAliasInfos);
  }

  public placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[] {
    return this.operationHandler.placeArith(name, inPts);
  }

  public adjustMemoryPts(
    dataPts: DataPt[],
    memoryPts: MemoryPts,
    srcOffset: number,
    dstOffset: number,
    viewLength: number,
  ): void {
    this.memoryManager.adjustMemoryPts(
      dataPts,
      memoryPts,
      srcOffset,
      dstOffset,
      viewLength,
    );
  }

  public place(
    name: SubcircuitNames,
    inPts: DataPt[],
    outPts: DataPt[],
    usage: ArithmeticOperator,
  ) {
    if (!this._state.subcircuitNames.includes(name)) {
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
      subcircuitId: this._state.subcircuitInfoByName.get(name)!.id,
      inPts,
      outPts,
    };
    this._state.placements.set(this._state.getNextPlacementIndex(), placement);
  }
}
