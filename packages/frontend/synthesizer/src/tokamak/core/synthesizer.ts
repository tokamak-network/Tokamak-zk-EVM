import {
  BIGINT_0,
  BIGINT_1,
  bigIntToBytes,
  bytesToHex,
  bytesToBigInt,
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
  MemoryPtEntry,
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
import { StateManager } from './handlers/stateManager.js';

/**
 * The Synthesizer class manages data related to subcircuits.
 * It acts as a facade, delegating tasks to various handler classes.
 */
export class Synthesizer {
  private state: StateManager;

  constructor() {
    this.state = new StateManager();
  }

  /**
   * Adds a new input-output pair to the LOAD subcircuit.
   * @param {DataPt} inPt - The input data point to be added to the buffer.
   * @param {number} placementId - The ID of the placement to add the wire to.
   * @returns {DataPt} The corresponding output data point from the buffer.
   * @private
   */
  private _addWireToInBuffer(inPt: DataPt, placementId: number): DataPt {
    if (
      !(
        placementId === PRV_IN_PLACEMENT_INDEX ||
        placementId === PUB_IN_PLACEMENT_INDEX
      )
    ) {
      throw new Error(`Synthesizer: Invalid use of buffers`);
    }
    // Use the length of existing output list as index for new output
    if (
      this.state.placements.get(placementId)!.inPts.length !==
      this.state.placements.get(placementId)!.outPts.length
    ) {
      throw new Error(
        `Synthesizer: Mismatch in the buffer wires (placement id: ${placementId})`,
      );
    }
    const outWireIndex = this.state.placements.get(placementId)!.outPts.length;
    // Create output data point
    const outPtRaw: CreateDataPointParams = {
      source: placementId,
      wireIndex: outWireIndex,
      value: inPt.value,
      sourceSize: inPt.sourceSize,
    };
    const outPt = DataPointFactory.create(outPtRaw);

    // Add input-output pair to the input buffer subcircuit
    this.state.placements.get(placementId)!.inPts.push(inPt);
    this.state.placements.get(placementId)!.outPts.push(outPt);

    return this.state.placements.get(placementId)!.outPts[outWireIndex];
  }

  private _addWireToOutBuffer(
    inPt: DataPt,
    outPt: DataPt,
    placementId: number,
  ): void {
    if (
      !(
        placementId === PRV_OUT_PLACEMENT_INDEX ||
        placementId === PUB_OUT_PLACEMENT_INDEX
      )
    ) {
      throw new Error(`Synthesizer: Invalid use of buffers`);
    }
    // Use the length of existing output list as index for new output
    if (
      this.state.placements.get(placementId)!.inPts.length !==
        this.state.placements.get(placementId)!.outPts.length ||
      inPt.value !== outPt.value
    ) {
      throw new Error(
        `Synthesizer: Mismatches in the buffer wires (placement id: ${placementId})`,
      );
    }
    const outPtIdx = this.state.placements.get(placementId)!.outPts.length;
    if (outPt.wireIndex !== outPtIdx) {
      throw new Error(
        `Synthesizer: Invalid indexing in the output wire of an output buffer (placement id: ${placementId}, wire id: ${outPtIdx})`,
      );
    }
    // Add input-output pair to the output buffer subcircuit
    this.state.placements.get(placementId)!.inPts.push(inPt);
    this.state.placements.get(placementId)!.outPts.push(outPt);
  }

  /**
   * Loads a PUSH instruction's argument into the synthesizer.
   * This is treated as a private input.
   * @param {string} codeAddress - The address of the contract code.
   * @param {number} programCounter - The program counter where the PUSH instruction occurs.
   * @param {bigint} value - Value of the PUSH input argument.
   * @returns {void}
   */
  public loadPUSH(
    codeAddress: string,
    programCounter: number,
    value: bigint,
    size: number,
  ): DataPt {
    const inPtRaw: CreateDataPointParams = {
      source: PRV_IN_PLACEMENT_INDEX,
      wireIndex: this.state.placements.get(PRV_IN_PLACEMENT_INDEX)!.inPts
        .length,
      extSource: `code: ${codeAddress}`,
      type: `PUSH${size}`,
      offset: programCounter + 1,
      value: value,
      sourceSize: size,
    };
    const inPt = DataPointFactory.create(inPtRaw);

    const outPt = this._addWireToInBuffer(inPt, PRV_IN_PLACEMENT_INDEX);
    this.state.auxin.set(this.state.auxin.size, {
      value: outPt.value,
      size: outPt.sourceSize,
    });
    return outPt;
  }

  public loadAuxin(value: bigint, size?: number): DataPt {
    const inPtRaw: CreateDataPointParams = {
      source: PRV_IN_PLACEMENT_INDEX,
      wireIndex: this.state.placements.get(PRV_IN_PLACEMENT_INDEX)!.inPts
        .length,
      type: 'AUXIN',
      value: value,
      sourceSize: size ?? DEFAULT_SOURCE_SIZE,
    };
    const inPt = DataPointFactory.create(inPtRaw);

    const outPt = this._addWireToInBuffer(inPt, PRV_IN_PLACEMENT_INDEX);
    this.state.auxin.set(this.state.auxin.size, {
      value: outPt.value,
      size: outPt.sourceSize,
    });
    return outPt;
  }

  public loadEnvInf(
    codeAddress: string,
    type: string,
    value: bigint,
    _offset?: number,
    size?: number,
  ): DataPt {
    const offset = _offset ?? 0;
    const inPtRaw: CreateDataPointParams = {
      source: PUB_IN_PLACEMENT_INDEX,
      wireIndex: this.state.placements.get(PUB_IN_PLACEMENT_INDEX)!.inPts
        .length,
      extSource: `env: ${codeAddress}`,
      type: type,
      offset: offset,
      value: value,
      sourceSize: size ?? DEFAULT_SOURCE_SIZE,
    };
    const inPt = DataPointFactory.create(inPtRaw);

    const outPt = this._addWireToInBuffer(inPt, PUB_IN_PLACEMENT_INDEX);
    this.state.envInf.set(`${type}:${offset}`, {
      value: outPt.value,
      wireIndex: outPt.wireIndex,
    });
    return outPt;
  }

  public loadStorage(codeAddress: string, key: bigint, value: bigint): DataPt {
    const inPtRaw: CreateDataPointParams = {
      source: PUB_IN_PLACEMENT_INDEX,
      wireIndex: this.state.placements.get(PUB_IN_PLACEMENT_INDEX)!.inPts
        .length,
      extSource: `storage: ${codeAddress}`,
      type: 'SLOAD',
      offset: Number(key),
      value: value,
      sourceSize: 32, // storage values are 32 bytes
    };
    const inPt = DataPointFactory.create(inPtRaw);
    const outPt = this._addWireToInBuffer(inPt, PUB_IN_PLACEMENT_INDEX);
    this.state.storagePt.set(
      bytesToHex(setLengthLeft(bigIntToBytes(key), 32)),
      outPt,
    );
    return outPt;
  }

  public storeStorage(codeAddress: string, key: bigint, inPt: DataPt): void {
    const outPtRaw: CreateDataPointParams = {
      source: PUB_OUT_PLACEMENT_INDEX,
      wireIndex: this.state.placements.get(PUB_OUT_PLACEMENT_INDEX)!.outPts
        .length,
      extSource: `storage: ${codeAddress}`,
      type: 'SSTORE',
      offset: Number(key),
      value: inPt.value,
      sourceSize: inPt.sourceSize,
    };
    const outPt = DataPointFactory.create(outPtRaw);
    this._addWireToOutBuffer(inPt, outPt, PUB_OUT_PLACEMENT_INDEX);
    this.state.storagePt.set(
      bytesToHex(setLengthLeft(bigIntToBytes(key), 32)),
      outPt,
    );
  }

  public storeLog(valPts: DataPt[], topicPts: DataPt[]): void {
    const logInfo = { topicPts: topicPts, valPts: valPts };
    const topicOutPts: DataPt[] = [];
    const valOutPts: DataPt[] = [];

    // Process topic points
    topicPts.forEach((topicPt, index) => {
      const outPt = DataPointFactory.create({
        source: PUB_OUT_PLACEMENT_INDEX,
        wireIndex:
          this.state.placements.get(PUB_OUT_PLACEMENT_INDEX)!.outPts.length +
          index,
        extSource: 'log',
        type: 'topic',
        value: topicPt.value,
        sourceSize: topicPt.sourceSize,
      });
      this._addWireToOutBuffer(topicPt, outPt, PUB_OUT_PLACEMENT_INDEX);
      topicOutPts.push(outPt);
    });

    // Process value points
    valPts.forEach((valPt, index) => {
      const outPt = DataPointFactory.create({
        source: PUB_OUT_PLACEMENT_INDEX,
        wireIndex:
          this.state.placements.get(PUB_OUT_PLACEMENT_INDEX)!.outPts.length +
          topicPts.length +
          index,
        extSource: 'log',
        type: 'value',
        value: valPt.value,
        sourceSize: valPt.sourceSize,
      });
      this._addWireToOutBuffer(valPt, outPt, PUB_OUT_PLACEMENT_INDEX);
      valOutPts.push(outPt);
    });

    this.state.logPt.push(logInfo);
  }

  public loadBlkInf(blkNumber: bigint, type: string, value: bigint): DataPt {
    const inPtRaw: CreateDataPointParams = {
      source: PUB_IN_PLACEMENT_INDEX,
      wireIndex: this.state.placements.get(PUB_IN_PLACEMENT_INDEX)!.inPts
        .length,
      extSource: `blk: ${blkNumber.toString()}`,
      type: type,
      offset: 0,
      value: value,
      sourceSize: 32, // block info is typically 32 bytes
    };
    const inPt = DataPointFactory.create(inPtRaw);
    const outPt = this._addWireToInBuffer(inPt, PUB_IN_PLACEMENT_INDEX);
    this.state.blkInf.set(`${type}:0`, {
      value: outPt.value,
      wireIndex: outPt.wireIndex,
    });
    return outPt;
  }

  private _processKeccakInputs(
    inPts: DataPt[],
    length: bigint,
  ): { value: bigint; inValues: bigint[] } {
    let value = BIGINT_0;
    const inValues = [];
    let currentSize = BIGINT_0;
    for (const inPt of inPts) {
      if (inPt.sourceSize) {
        currentSize += BigInt(inPt.sourceSize);
      } else {
        throw new Error(
          'Synthesizer: Keccak input data point must have a source size',
        );
      }
      value = value * (1n << BigInt(inPt.sourceSize * 8)) + inPt.value;
      inValues.push(inPt.value);
    }
    if (currentSize !== length) {
      throw new Error('Synthesizer: Invalid total length of Keccak inputs');
    }
    return { value, inValues };
  }

  private _executeAndValidateKeccak(
    value: bigint,
    length: bigint,
    expectedOutValue: bigint,
  ): void {
    const outValue = bytesToBigInt(
      keccak256(setLengthLeft(bigIntToBytes(value), Number(length))),
    );
    if (outValue !== expectedOutValue) {
      throw new Error('Synthesizer: Keccak output mismatch');
    }
  }

  private _recordKeccakToBuffers(inPts: DataPt[], outValue: bigint): DataPt {
    const keccakInPts = inPts.map((inPt, i) =>
      DataPointFactory.create({
        source: PUB_IN_PLACEMENT_INDEX,
        wireIndex:
          this.state.placements.get(PUB_IN_PLACEMENT_INDEX)!.inPts.length + i,
        extSource: 'keccak',
        type: 'keccak_in',
        value: inPt.value,
        sourceSize: inPt.sourceSize,
      }),
    );
    const keccakOutPt = DataPointFactory.create({
      source: PUB_OUT_PLACEMENT_INDEX,
      wireIndex: this.state.placements.get(PUB_OUT_PLACEMENT_INDEX)!.outPts
        .length,
      extSource: 'keccak',
      type: 'keccak_out',
      value: outValue,
      sourceSize: 32, // keccak output is 32 bytes
    });

    for (const p of keccakInPts) {
      this._addWireToInBuffer(p, PUB_IN_PLACEMENT_INDEX);
    }
    this._addWireToOutBuffer(
      keccakInPts[0],
      keccakOutPt,
      PUB_OUT_PLACEMENT_INDEX,
    );
    this.state.keccakPt.push({
      inValues: keccakInPts.map((p) => p.value),
      outValue: keccakOutPt.value,
    });

    return keccakOutPt;
  }

  public loadAndStoreKeccak(
    inPts: DataPt[],
    outValue: bigint,
    length: bigint,
  ): DataPt {
    const { value } = this._processKeccakInputs(inPts, length);
    this._executeAndValidateKeccak(value, length, outValue);
    const outPt = this._recordKeccakToBuffers(inPts, outValue);
    // TODO: Consider to add keccak subcircuit
    return outPt;
  }

  /**
   * Adds a new MSTORE placement.
   * MSTORE is one of the Ethereum Virtual Machine (EVM) opcodes, which stores 32 bytes (256 bits) of data into memory.
   * EVM opcode description
   * MSTORE:
   * Function: Stores 32 bytes of data into memory at a specific memory location.
   * Stack operations: Pops two values from the stack. The first value is the memory address, and the second value is the data to be stored.
   * Example: MSTORE pops the memory address and data from the stack and stores the data at the specified memory address.
   *
   * @param {DataPt} inPt - Input data point.
   * @param {DataPt} outPt - Output data point.
   * @returns {void}
   * This method adds a new MSTORE placement by simulating the MSTORE opcode. If truncSize is less than dataPt.actualSize,
   * only the lower bytes of data are stored, and the upper bytes are discarded. The modified data point is returned.
   */
  public placeMSTORE(dataPt: DataPt, truncSize: number): DataPt {
    const bitmask = (1n << BigInt(truncSize * 8)) - 1n;
    const maskPt = this.loadAuxin(bitmask, 32);
    const truncOutPts = this.placeArith('AND', [dataPt, maskPt]);
    if (truncOutPts.length !== 1) {
      throw new SynthesizerError(
        'placeMSTORE',
        'Bitwise operation should return a single DataPt',
      );
    }

    this._place('Memory', [dataPt], truncOutPts, ArithmeticOperations.MSTORE);
    return truncOutPts[0];
  }

  /**
   * Adds a new MLOAD placement.
   *
   * MLOAD is one of the Ethereum Virtual Machine (EVM) opcodes, which loads 32 bytes (256 bits) of data from memory.
   * @param {DataAliasInfos} dataAliasInfos - Array containing data source and modification information.
   * @returns {DataPt} Generated data point.
   */
  public placeMemoryToStack(dataAliasInfos: DataAliasInfos): DataPt {
    const transformedDataPts = dataAliasInfos.map((info) =>
      this._transformMemorySlice(info),
    );

    if (transformedDataPts.length === 0) {
      throw new SynthesizerError(
        'placeMemoryToStack',
        'No data slices to process',
      );
    }

    let combinedData = transformedDataPts[0];
    for (let i = 1; i < transformedDataPts.length; i++) {
      combinedData = this.placeArith('OR', [
        combinedData,
        transformedDataPts[i],
      ])[0];
    }
    return combinedData;
  }

  public placeMemoryToMemory(dataAliasInfos: DataAliasInfos): DataPt[] {
    const transformedDataPts = dataAliasInfos.map((info) =>
      this._transformMemorySlice(info),
    );
    return transformedDataPts;
  }

  // /**
  // @todo: Validation needed for newDataPt size variable
  //  */
  // private static readonly REQUIRED_INPUTS: Partial<Record<string, number>> = {
  //   ADDMOD: 3,
  //   MULMOD: 3,
  //   ISZERO: 1,
  //   NOT: 1,
  //   DecToBit: 1,
  //   SubEXP: 3,
  // } as const
  // private validateOperation(name: ArithmeticOperator, inPts: DataPt[]): void {
  //   // Default is 2, check REQUIRED_INPUTS only for exceptional cases
  //   const requiredInputs = Synthesizer.REQUIRED_INPUTS[name] ?? 2
  //   SynthesizerValidator.validateInputCount(name, inPts.length, requiredInputs)
  //   SynthesizerValidator.validateInputs(inPts)
  // }

  private executeOperation(
    name: ArithmeticOperator,
    values: bigint[],
  ): bigint | bigint[] {
    const operation: ArithmeticFunction = OPERATION_MAPPING[name];
    if (!operation) {
      throw new SynthesizerError(
        'executeOperation',
        `Unsupported arithmetic operation: ${name}`,
      );
    }
    return operation(values);
  }

  private _createArithmeticOutput(
    name: ArithmeticOperator,
    inPts: DataPt[],
  ): DataPt[] {
    const values = inPts.map((p) => p.value);
    const outValue = this.executeOperation(name, values);

    const source = this.state.getNextPlacementIndex();
    const sourceSize = name === 'DecToBit' ? 1 : DEFAULT_SOURCE_SIZE;
    return Array.isArray(outValue)
      ? outValue.map((v, i) =>
          DataPointFactory.create({
            source,
            wireIndex: i,
            value: v,
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

  private _prepareSubcircuitInputs(
    name: ArithmeticOperator,
    inPts: DataPt[],
  ): { subcircuitName: SubcircuitNames; finalInPts: DataPt[] } {
    const [subcircuitName, selector] = SUBCIRCUIT_MAPPING[name];

    if (this.state.subcircuitInfoByName.get(subcircuitName) === undefined) {
      throw new Error(
        `Synthesizer: ${subcircuitName} subcircuit is not found for operation ${name}. Check qap-compiler.`,
      );
    }

    // If the operation requires a selector, load it as an auxiliary input.
    const finalInPts =
      selector !== undefined ? [this.loadAuxin(selector, 1), ...inPts] : inPts;

    return { subcircuitName, finalInPts };
  }

  /**
   * Adds a new arithmetic placement.
   *
   * @param {string} name - Name of the placement. Examples: 'ADD', 'SUB', 'MUL', 'DIV'.
   * @param {DataPt[]} inPts - Array of input data points.
   * @returns {DataPt[]} Array of generated output data points.
   * @throws {Error} If an undefined subcircuit name is provided.
   */
  public placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[] {
    const { subcircuitName, finalInPts } = this._prepareSubcircuitInputs(
      name,
      inPts,
    );
    const outPts = this._createArithmeticOutput(name, inPts);

    this._place(
      subcircuitName,
      finalInPts,
      outPts,
      OPERATION_MAPPING[name].usage,
    );
    return outPts;
  }

  private _calculateViewAdjustment(
    memoryPt: MemoryPtEntry,
    srcOffset: number,
    dstOffset: number,
    viewLength: number,
  ) {
    const startPos = dstOffset - memoryPt.memOffset;
    const endPos = startPos + viewLength;
    const startingGap = Math.max(0, startPos);
    const endingGap = Math.max(0, memoryPt.containerSize - endPos);
    const shift = (srcOffset - dstOffset + startingGap) * 8;
    return { startingGap, endingGap, shift };
  }

  private _truncateDataPt(dataPt: DataPt, endingGap: number): DataPt {
    let truncatedPt = dataPt;
    if (endingGap > 0) {
      const mask =
        (1n << BigInt(dataPt.sourceSize * 8)) - (1n << BigInt(endingGap * 8));
      const maskPt = this.loadAuxin(mask, dataPt.sourceSize);
      [truncatedPt] = this.placeArith('AND', [dataPt, maskPt]);
    }
    return truncatedPt;
  }

  public adjustMemoryPts(
    memoryPts: MemoryPts,
    dataPts: DataPt[],
    srcOffset: number,
    dstOffset: number,
    viewLength: number,
  ): void {
    const memoryOverlaps = simulateMemoryPt(memoryPts).getOverlaps(
      dstOffset,
      viewLength,
    );

    memoryOverlaps.forEach((memoryPt: MemoryPtEntry) => {
      const { endingGap, shift } = this._calculateViewAdjustment(
        memoryPt,
        srcOffset,
        dstOffset,
        viewLength,
      );
      let dataToShift = this._truncateDataPt(
        dataPts[memoryPt.index],
        endingGap,
      );

      if (shift !== 0) {
        const shiftAbs = BigInt(Math.abs(shift));
        const shiftPt = this.loadAuxin(shiftAbs, 32);
        const op: ArithmeticOperator = shift > 0 ? 'SHL' : 'SHR';
        [dataToShift] = this.placeArith(op, [dataToShift, shiftPt]);
      }

      this._place('Memory', [dataToShift], [], ArithmeticOperations.MSTORE);
    });
  }

  /**
   * MLOAD always reads 32 bytes, but since the offset is in byte units, data transformation can occur.
   * Implement a function to track data transformations by checking for data modifications.
   * The getDataAlias(offset, size) function tracks the source of data from offset to offset + size - 1 in Memory.
   * The result may have been transformed through cutting or concatenating multiple data pieces.
   * The output type of getDataAlias is as follows:
   * type DataAliasInfos = {dataPt: DataPt, shift: number, masker: string}[]
   * For example, if dataAliasInfos array length is 3, the transformed data from that memory address
   * is a combination of 3 original data pieces.
   * The sources of the 3 original data are stored in dataPt,
   * Each original data is bit shifted by "shift" amount (left if negative, right if positive),
   * Then AND'ed with their respective "masker",
   * Finally, OR'ing all results will give the transformed data.
   **/

  /**
   * Combines multiple memory slices into a single data point.
   * It transforms each slice by applying shifts and masks, then accumulates them if necessary.
   *
   * @param {DataAliasInfos} dataAliasInfos - An array of memory slice information.
   * @returns {DataPt} The final, combined data point.
   */
  private _combineMemorySlices(dataAliasInfos: DataAliasInfos): DataPt {
    let combinedData: DataPt | undefined = undefined;
    for (const info of dataAliasInfos) {
      const transformedSlice = this._transformMemorySlice(info);
      if (combinedData) {
        combinedData = this.placeArith('OR', [
          combinedData,
          transformedSlice,
        ])[0];
      } else {
        combinedData = transformedSlice;
      }
    }
    if (combinedData === undefined) {
      throw new SynthesizerError(
        '_combineMemorySlices',
        'No data slices to combine',
      );
    }
    return combinedData;
  }

  /**
   * Applies shift and mask transformations to a single memory slice.
   *
   * @param {DataAliasInfoEntry} info - The memory slice information.
   * @returns {DataPt} The transformed data point.
   */
  private _transformMemorySlice(info: DataAliasInfoEntry): DataPt {
    const masked = this._applyMask(info);
    return this._applyShift({ ...info, dataPt: masked });
  }

  /**
   * Applies shift operation.
   *
   * @param {bigint} shift - Shift value to apply.
   * @param {DataPt} dataPt - Data point.
   * @returns {bigint} Shifted value.
   */
  private _applyShift(info: DataAliasInfoEntry): DataPt {
    let dataPt = info.dataPt;
    if (info.shift !== 0) {
      const shiftAbs = BigInt(Math.abs(info.shift));
      const shiftPt = this.loadAuxin(shiftAbs, 32);
      const op: ArithmeticOperator = info.shift > 0 ? 'SHL' : 'SHR';
      [dataPt] = this.placeArith(op, [dataPt, shiftPt]);
    }
    return dataPt;
  }

  /**
   * Applies mask operation.
   *
   * @param {string} masker - Mask value to apply.
   * @param {bigint} dataPt - Pointer to apply the mask.
   */
  private _applyMask(info: DataAliasInfoEntry, unshift?: boolean): DataPt {
    let dataPt = info.dataPt;
    const mask = (1n << BigInt(info.viewLength * 8)) - 1n;
    const maskPt = this.loadAuxin(mask, info.dataPt.sourceSize);
    [dataPt] = this.placeArith('AND', [dataPt, maskPt]);

    if (unshift && info.shift < 0) {
      const shiftAbs = BigInt(Math.abs(info.shift));
      const shiftPt = this.loadAuxin(shiftAbs, 32);
      [dataPt] = this.placeArith('SHL', [dataPt, shiftPt]);
    }
    return dataPt;
  }

  private _place(
    name: SubcircuitNames,
    inPts: DataPt[],
    outPts: DataPt[],
    usage: ArithmeticOperations,
  ) {
    const subcircuitInfo = this.state.subcircuitInfoByName.get(name);
    if (!subcircuitInfo) {
      throw new SynthesizerError(
        '_place',
        `Subcircuit information for '${name}' not found.`,
      );
    }

    if (
      inPts.length > subcircuitInfo.NInWires ||
      outPts.length > subcircuitInfo.NOutWires
    ) {
      throw new InvalidInputCountError(
        name,
        inPts.length,
        outPts.length,
        subcircuitInfo,
      );
    }

    const placementId = this.state.getNextPlacementIndex();
    addPlacement(this.state.placements, placementId, name, inPts, outPts, {
      op: usage,
    });
  }
}
