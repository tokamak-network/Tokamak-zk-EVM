import {
  BIGINT_0,
  BIGINT_1,
  bigIntToBytes,
  bytesToHex,
  setLengthLeft,
} from '@synthesizer-libs/util';
import { keccak256 } from 'ethereum-cryptography/keccak.js';

import {
  DEFAULT_SOURCE_SIZE,
  INITIAL_PLACEMENT_INDEX,
  PUB_IN_PLACEMENT,
  PUB_IN_PLACEMENT_INDEX,
  PUB_OUT_PLACEMENT,
  PUB_OUT_PLACEMENT_INDEX,
  PRV_IN_PLACEMENT,
  PRV_IN_PLACEMENT_INDEX,
  PRV_OUT_PLACEMENT,
  PRV_OUT_PLACEMENT_INDEX,
  SUBCIRCUIT_MAPPING,
  ACCUMULATOR_INPUT_LIMIT,
  // KECCAK_IN_PLACEMENT,
  // KECCAK_IN_PLACEMENT_INDEX,
  // KECCAK_OUT_PLACEMENT,
  // KECCAK_OUT_PLACEMENT_INDEX,
  // LOAD_PLACEMENT,
  // LOAD_PLACEMENT_INDEX,
  // RETURN_PLACEMENT,
  // RETURN_PLACEMENT_INDEX,
  // STORAGE_IN_PLACEMENT,
  // STORAGE_IN_PLACEMENT_INDEX,
  // STORAGE_OUT_PLACEMENT,
  // STORAGE_OUT_PLACEMENT_INDEX,
} from '../constant/index.js';

import { subcircuits } from '../constant/index.js';
import {
  ArithmeticOperations,
  OPERATION_MAPPING,
} from '../operations/index.js';
import { DataPointFactory, simulateMemoryPt } from '../pointers/index.js';
import { addPlacement } from '../utils/utils.js';
import {
  InvalidInputCountError,
  SynthesizerError,
} from '../validation/index.js';

import type {
  DataAliasInfoEntry,
  DataAliasInfos,
  MemoryPts,
} from '../pointers/index.js';
import type {
  ArithmeticOperator,
  Auxin,
  CreateDataPointParams,
  DataPt,
  Placements,
  SubcircuitInfoByName,
  SubcircuitInfoByNameEntry,
  SubcircuitNames,
} from '../types/index.js';
import type { PlacementEntry } from '../types/synthesizer.js';
import { StateManager } from './handlers/stateManager.js';
import { OperationHandler } from './handlers/operationHandler.js';
import { DataLoader } from './handlers/dataLoader.js';
import { MemoryManager } from './handlers/memoryManager.js';
import type { ISynthesizerProvider } from './handlers/synthesizerProvider.js';
import type { IDataLoaderProvider } from './handlers/dataLoaderProvider.js';
import type { IMemoryManagerProvider } from './handlers/memoryManagerProvider.js';

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

  constructor() {
    this._state = new StateManager();
    this.operationHandler = new OperationHandler(this, this._state);
    this.dataLoader = new DataLoader(this, this._state);
    this.memoryManager = new MemoryManager(this, this._state);
  }

  public get state(): StateManager {
    return this._state;
  }

  public addWireToInBuffer(inPt: DataPt, placementId: number): DataPt {
    if (
      !(
        placementId == PRV_IN_PLACEMENT_INDEX ||
        placementId == PUB_IN_PLACEMENT_INDEX
      )
    ) {
      throw new Error(`Synthesizer: Invalid use of buffers`);
    }
    // Use the length of existing output list as index for new output
    if (
      this._state.placements.get(placementId)!.inPts.length !==
      this._state.placements.get(placementId)!.outPts.length
    ) {
      throw new Error(
        `Synthesizer: Mismatch in the buffer wires (placement id: ${placementId})`,
      );
    }
    const outWireIndex = this._state.placements.get(placementId)!.outPts.length;
    // Create output data point
    const outPtRaw: CreateDataPointParams = {
      source: placementId,
      wireIndex: outWireIndex,
      value: inPt.value,
      sourceSize: inPt.sourceSize,
    };
    const outPt = DataPointFactory.create(outPtRaw);

    // Add input-output pair to the input buffer subcircuit
    this._state.placements.get(placementId)!.inPts.push(inPt);
    this._state.placements.get(placementId)!.outPts.push(outPt);

    return this._state.placements.get(placementId)!.outPts[outWireIndex];
  }

  public addWireToOutBuffer(
    inPt: DataPt,
    outPt: DataPt,
    placementId: number,
  ): void {
    if (
      !(
        placementId == PRV_OUT_PLACEMENT_INDEX ||
        placementId == PUB_OUT_PLACEMENT_INDEX
      )
    ) {
      throw new Error(`Synthesizer: Invalid use of buffers`);
    }
    // Use the length of existing output list as index for new output
    if (
      this._state.placements.get(placementId)!.inPts.length !==
        this._state.placements.get(placementId)!.outPts.length ||
      inPt.value !== outPt.value
    ) {
      throw new Error(
        `Synthesizer: Mismatches in the buffer wires (placement id: ${placementId})`,
      );
    }
    let outPtIdx = this._state.placements.get(placementId)!.outPts.length;
    if (outPt.wireIndex !== outPtIdx) {
      throw new Error(
        `Synthesizer: Invalid indexing in the output wire of an output buffer (placement id: ${placementId}, wire id: ${outPtIdx})`,
      );
    }
    // Add input-output pair to the output buffer subcircuit
    this._state.placements.get(placementId)!.inPts.push(inPt);
    this._state.placements.get(placementId)!.outPts.push(outPt);
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

  /**
   * Executes an arithmetic operation on the given values.
   *
   * @param {ArithmeticOperator} name - The name of the arithmetic operation.
   * @param {bigint[]} values - An array of bigint values as input for the operation.
   * @returns {bigint | bigint[]} The result of the operation.
   */
  private executeOperation(
    name: ArithmeticOperator,
    values: bigint[],
  ): bigint | bigint[] {
    const operation = OPERATION_MAPPING[name];
    if (name === 'Accumulator') {
      return operation(values);
    } else {
      return operation(...values);
    }
  }

  /**
   * Creates the output data points for an arithmetic operation.
   *
   * @param {ArithmeticOperator} name - The name of the arithmetic operation.
   * @param {DataPt[]} inPts - The input data points for the operation.
   * @returns {DataPt[]} An array of output data points.
   */
  private _createArithmeticOutput(
    name: ArithmeticOperator,
    inPts: DataPt[],
  ): DataPt[] {
    const values = inPts.map((pt) => pt.value);
    const outValue = this.executeOperation(name, values);

    const source = this._state.placementIndex;
    const sourceSize = name === 'DecToBit' ? 1 : DEFAULT_SOURCE_SIZE;
    return Array.isArray(outValue)
      ? outValue.map((value, index) =>
          DataPointFactory.create({
            source,
            wireIndex: index,
            value,
            sourceSize,
          }),
        )
      : [
          DataPointFactory.create({
            source,
            wireIndex: 0,
            value: outValue,
            sourceSize,
          }),
        ];
  }

  /**
   * Prepares the inputs for a subcircuit, including any required selectors.
   *
   * @param {ArithmeticOperator} name - The name of the arithmetic operation.
   * @param {DataPt[]} inPts - The input data points.
   * @returns {{ subcircuitName: SubcircuitNames; finalInPts: DataPt[] }} The name of the subcircuit and the final input data points.
   */
  private _prepareSubcircuitInputs(
    name: ArithmeticOperator,
    inPts: DataPt[],
  ): { subcircuitName: SubcircuitNames; finalInPts: DataPt[] } {
    const [subcircuitName, selector] = SUBCIRCUIT_MAPPING[name];

    if (this._state.subcircuitInfoByName.get(subcircuitName) === undefined) {
      throw new Error(
        `Synthesizer: ${subcircuitName} subcircuit is not found for operation ${name}. Check qap-compiler.`,
      );
    }

    let finalInPts: DataPt[] = inPts;
    if (selector !== undefined) {
      const selectorPt = this.loadAuxin(selector, 1);
      finalInPts = [selectorPt, ...inPts];
    }

    if (subcircuitName === 'ALU3' || subcircuitName === 'ALU5') {
      const values = inPts.map((pt) => pt.value);
      if (values[0] > 255n) {
        throw new Error(
          `Synthesizer: Operation ${name} has a shift or size value greater than 255. Adjust ${subcircuitName} subcircuit in qap-compiler.`,
        );
      }
    }

    return { subcircuitName, finalInPts };
  }

  /**
   * Places an arithmetic operation in the synthesizer.
   *
   * This involves creating output data points, preparing inputs, and adding the placement.
   *
   * @param {ArithmeticOperator} name - The name of the arithmetic operation.
   * @param {DataPt[]} inPts - The input data points.
   * @returns {DataPt[]} The output data points from the operation.
   */
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
