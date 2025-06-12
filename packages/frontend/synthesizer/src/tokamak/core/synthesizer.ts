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

/**
 * The Synthesizer class manages data related to subcircuits.
 *
 * @property {Placements} placements - Map storing subcircuit placement information.
 * @property {bigint[]} auxin - Array storing auxiliary input data.
 * @property {number} placementIndex - Current placement index.
 * @property {string[]} subcircuitNames - Array storing subcircuit names.
 */
export class Synthesizer {
  public placements!: Placements;
  public auxin!: Auxin;
  public envInf!: Map<string, { value: bigint; wireIndex: number }>;
  public blkInf!: Map<string, { value: bigint; wireIndex: number }>;
  public storagePt!: Map<string, DataPt>;
  public logPt!: { topicPts: DataPt[]; valPts: DataPt[] }[];
  public keccakPt!: { inValues: bigint[]; outValue: bigint }[];
  public TStoragePt!: Map<string, Map<bigint, DataPt>>;
  protected placementIndex!: number;
  private subcircuitNames!: SubcircuitNames[];
  subcircuitInfoByName!: SubcircuitInfoByName;

  constructor() {
    this._initializeState();
    this._initializeSubcircuitInfo();
    this._initializePlacements();
    this.placementIndex = INITIAL_PLACEMENT_INDEX;
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
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore is kept as it might indicate a type issue in the imported 'subcircuits' constant
    this.subcircuitNames = subcircuits.map((circuit) => circuit.name);

    for (const subcircuit of subcircuits) {
      const entryObject: SubcircuitInfoByNameEntry = {
        id: subcircuit.id,
        NWires: subcircuit.Nwires,
        NInWires: subcircuit.In_idx[1],
        NOutWires: subcircuit.Out_idx[1],
        inWireIndex: subcircuit.In_idx[0],
        outWireIndex: subcircuit.Out_idx[0],
      };
      // Cast `subcircuit.name` to `SubcircuitNames` to resolve the type error.
      this.subcircuitInfoByName.set(
        subcircuit.name as SubcircuitNames,
        entryObject,
      );
    }
  }

  /**
   * Initializes the default placements for public/private inputs and outputs.
   */
  private _initializePlacements(): void {
    const initialPlacements = [
      { index: PUB_IN_PLACEMENT_INDEX, data: PUB_IN_PLACEMENT },
      { index: PUB_OUT_PLACEMENT_INDEX, data: PUB_OUT_PLACEMENT },
      { index: PRV_IN_PLACEMENT_INDEX, data: PRV_IN_PLACEMENT },
      { index: PRV_OUT_PLACEMENT_INDEX, data: PRV_OUT_PLACEMENT },
    ];

    for (const p of initialPlacements) {
      const subcircuitId = this.subcircuitInfoByName.get(p.data.name)?.id;
      if (subcircuitId === undefined) {
        throw new Error(
          `Synthesizer: Could not find subcircuit ID for placement '${p.data.name}'`,
        );
      }
      this.placements.set(p.index, {
        ...p.data,
        subcircuitId,
      });
    }
  }

  /**
   * Adds a new input-output pair to the LOAD subcircuit.
   * @param pointerIn - Input data point
   * @returns Generated output data point
   * @private
   */
  private _addWireToInBuffer(inPt: DataPt, placementId: number): DataPt {
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
      this.placements.get(placementId)!.inPts.length !==
      this.placements.get(placementId)!.outPts.length
    ) {
      throw new Error(
        `Synthesizer: Mismatch in the buffer wires (placement id: ${placementId})`,
      );
    }
    const outWireIndex = this.placements.get(placementId)!.outPts.length;
    // Create output data point
    const outPtRaw: CreateDataPointParams = {
      source: placementId,
      wireIndex: outWireIndex,
      value: inPt.value,
      sourceSize: inPt.sourceSize,
    };
    const outPt = DataPointFactory.create(outPtRaw);

    // Add input-output pair to the input buffer subcircuit
    this.placements.get(placementId)!.inPts.push(inPt);
    this.placements.get(placementId)!.outPts.push(outPt);

    return this.placements.get(placementId)!.outPts[outWireIndex];
  }

  private _addWireToOutBuffer(
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
      this.placements.get(placementId)!.inPts.length !==
        this.placements.get(placementId)!.outPts.length ||
      inPt.value !== outPt.value
    ) {
      throw new Error(
        `Synthesizer: Mismatches in the buffer wires (placement id: ${placementId})`,
      );
    }
    let outPtIdx = this.placements.get(placementId)!.outPts.length;
    if (outPt.wireIndex !== outPtIdx) {
      throw new Error(
        `Synthesizer: Invalid indexing in the output wire of an output buffer (placement id: ${placementId}, wire id: ${outPtIdx})`,
      );
    }
    // Add input-output pair to the output buffer subcircuit
    this.placements.get(placementId)!.inPts.push(inPt);
    this.placements.get(placementId)!.outPts.push(outPt);
  }

  /**
   * Adds a new input-output pair to the LOAD placement caused by the PUSH instruction.
   *
   * @param {string} codeAddress - Address of the code where PUSH was executed.
   * @param {number} programCounter - Program counter of the PUSH input argument.
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
      extSource: `code: ${codeAddress}`,
      type: `PUSH${size}`,
      offset: programCounter + 1,
      source: PRV_IN_PLACEMENT_INDEX,
      wireIndex: this.placements.get(PRV_IN_PLACEMENT_INDEX)!.inPts.length,
      value,
      sourceSize: DEFAULT_SOURCE_SIZE,
    };
    const inPt: DataPt = DataPointFactory.create(inPtRaw);

    return this._addWireToInBuffer(inPt, PRV_IN_PLACEMENT_INDEX);
  }

  public loadAuxin(value: bigint, size?: number): DataPt {
    const sourceSize = size ?? DEFAULT_SOURCE_SIZE;
    if (this.auxin.has(value)) {
      return this.placements.get(PRV_IN_PLACEMENT_INDEX)!.outPts[
        this.auxin.get(value)!
      ];
    }
    const inPtRaw: CreateDataPointParams = {
      extSource: 'auxin',
      source: PRV_IN_PLACEMENT_INDEX,
      wireIndex: this.placements.get(PRV_IN_PLACEMENT_INDEX)!.inPts.length,
      value,
      sourceSize,
    };
    const inPt = DataPointFactory.create(inPtRaw);
    const outPt = this._addWireToInBuffer(inPt, PRV_IN_PLACEMENT_INDEX);
    this.auxin.set(value, outPt.wireIndex!);
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
    const sourceSize = size ?? DEFAULT_SOURCE_SIZE;
    const uniqueId = {
      extSource: `code: ${codeAddress}`,
      type,
      offset,
      sourceSize,
    };
    const key = JSON.stringify({ ...uniqueId, value: value.toString(16) });
    if (this.envInf.has(key)) {
      return this.placements.get(PRV_IN_PLACEMENT_INDEX)!.outPts[
        this.envInf.get(key)!.wireIndex
      ];
    }
    const inPtRaw: CreateDataPointParams = {
      ...uniqueId,
      source: PRV_IN_PLACEMENT_INDEX,
      wireIndex: this.placements.get(PRV_IN_PLACEMENT_INDEX)!.inPts.length,
      value,
    };
    const inPt = DataPointFactory.create(inPtRaw);
    const outPt = this._addWireToInBuffer(inPt, PRV_IN_PLACEMENT_INDEX);
    const envInfEntry = {
      value,
      wireIndex: outPt.wireIndex!,
    };
    this.envInf.set(key, envInfEntry);
    return outPt;
  }

  public loadStorage(codeAddress: string, key: bigint, value: bigint): DataPt {
    const keyString = JSON.stringify({
      address: codeAddress,
      key: key.toString(16),
    });
    let inPt: DataPt;
    if (this.storagePt.has(keyString)) {
      // Warm access to the address and key, so we reuse the already registered output of the buffer.
      return this.storagePt.get(keyString)!;
    } else {
      // The first access to the address and key
      // Register it to the buffer and the storagePt
      // In the future, this part will be replaced with merkle proof verification (the storage dataPt will not be registered in the buffer).
      const inPtRaw: CreateDataPointParams = {
        extSource: `Load storage: ${codeAddress}`,
        key: '0x' + key.toString(16),
        source: PRV_IN_PLACEMENT_INDEX,
        wireIndex: this.placements.get(PRV_IN_PLACEMENT_INDEX)!.inPts.length,
        value,
        sourceSize: DEFAULT_SOURCE_SIZE,
      };
      inPt = DataPointFactory.create(inPtRaw);
      // Registering it to the buffer
      const outPt = this._addWireToInBuffer(inPt, PRV_IN_PLACEMENT_INDEX);
      // Registering it to the storagePt
      this.storagePt.set(keyString, outPt);
      return outPt;
    }
  }

  public storeStorage(codeAddress: string, key: bigint, inPt: DataPt): void {
    const keyString = JSON.stringify({
      address: codeAddress,
      key: key.toString(16),
    });
    // By just updating the storagePt, the Synthesizer can track down where the data comes from, whenever it is loaded next time.
    this.storagePt.set(keyString, inPt);
    // We record the storage modification in the placements just for users to aware of it (it is not for the Synthesizer).
    const outPtRaw: CreateDataPointParams = {
      extDest: `Write storage: ${codeAddress}`,
      key: '0x' + key.toString(16),
      source: PRV_OUT_PLACEMENT_INDEX,
      wireIndex: this.placements.get(PRV_OUT_PLACEMENT_INDEX)!.outPts.length,
      value: inPt.value,
      sourceSize: DEFAULT_SOURCE_SIZE,
    };
    const outPt = DataPointFactory.create(outPtRaw);
    this._addWireToOutBuffer(inPt, outPt, PRV_OUT_PLACEMENT_INDEX);
  }

  public storeLog(valPts: DataPt[], topicPts: DataPt[]): void {
    this.logPt.push({ valPts, topicPts });
    let logKey = BigInt(this.logPt.length - 1);
    let outWireIndex = this.placements.get(PRV_OUT_PLACEMENT_INDEX)!.outPts
      .length;
    // Create output data point for topics
    for (const [index, topicPt] of topicPts.entries()) {
      const outPtRaw: CreateDataPointParams = {
        extDest: 'LOG',
        key: '0x' + logKey.toString(16),
        type: `topic${index}`,
        source: PRV_OUT_PLACEMENT_INDEX,
        wireIndex: outWireIndex++,
        value: topicPt.value,
        sourceSize: DEFAULT_SOURCE_SIZE,
      };
      const topicOutPt = DataPointFactory.create(outPtRaw);
      // Add input-output pair to the buffer
      this._addWireToOutBuffer(topicPt, topicOutPt, PRV_OUT_PLACEMENT_INDEX);
    }

    // Create output data point
    for (const [index, valPt] of valPts.entries()) {
      const outPtRaw: CreateDataPointParams = {
        extDest: 'LOG',
        key: '0x' + logKey.toString(16),
        type: `value${index}`,
        source: PRV_OUT_PLACEMENT_INDEX,
        wireIndex: outWireIndex++,
        value: valPt.value,
        sourceSize: DEFAULT_SOURCE_SIZE,
      };
      const valOutPt = DataPointFactory.create(outPtRaw);
      // Add input-output pair to the buffer
      this._addWireToOutBuffer(valPt, valOutPt, PRV_OUT_PLACEMENT_INDEX);
    }
  }

  public loadBlkInf(blkNumber: bigint, type: string, value: bigint): DataPt {
    let hexRaw = value.toString(16);
    const paddedHex = hexRaw.length % 2 === 1 ? '0' + hexRaw : hexRaw;
    const valueHex = '0x' + paddedHex;
    const blockInfo = {
      extSource: `block number: ${Number(blkNumber)}`,
      type,
      valueHex,
    };
    const key = JSON.stringify(blockInfo);
    if (this.blkInf.has(key)) {
      // Warm access
      return this.placements.get(PRV_IN_PLACEMENT_INDEX)!.outPts[
        this.blkInf.get(key)!.wireIndex
      ];
    }
    const inPt: DataPt = {
      ...blockInfo,
      source: PRV_IN_PLACEMENT_INDEX,
      wireIndex: this.placements.get(PRV_IN_PLACEMENT_INDEX)!.inPts.length,
      value,
      sourceSize: DEFAULT_SOURCE_SIZE,
    };
    const outPt = this._addWireToInBuffer(inPt, PRV_IN_PLACEMENT_INDEX);
    const blkInfEntry = {
      value,
      wireIndex: outPt.wireIndex!,
    };
    this.blkInf.set(key, blkInfEntry);
    return outPt;
  }

  private _processKeccakInputs(
    inPts: DataPt[],
    length: bigint,
  ): { value: bigint; inValues: bigint[] } {
    const nChunks = inPts.length;
    const lengthNum = Number(length);
    let value = BIGINT_0;
    const inValues: bigint[] = [];
    let lengthLeft = lengthNum;

    for (let i = 0; i < nChunks; i++) {
      const _length = lengthLeft > 32 ? 32 : lengthLeft;
      lengthLeft -= _length;
      value += inPts[i].value << BigInt(lengthLeft * 8);
      inValues[i] = inPts[i].value;
    }
    return { value, inValues };
  }

  private _executeAndValidateKeccak(
    value: bigint,
    length: bigint,
    expectedOutValue: bigint,
  ): void {
    const lengthNum = Number(length);
    let data: Uint8Array;
    if (length !== 0n) {
      const valueInBytes = bigIntToBytes(value);
      data = setLengthLeft(valueInBytes, lengthNum ?? valueInBytes.length);
    } else {
      data = new Uint8Array(0);
    }
    const actualOutValue = BigInt(bytesToHex(keccak256(data)));
    if (actualOutValue !== expectedOutValue) {
      throw new Error(
        `Synthesizer: loadAndStoreKeccak: The Keccak hash may be customized`,
      );
    }
  }

  private _recordKeccakToBuffers(
    inPts: DataPt[],
    outValue: bigint,
    keccakKey: bigint,
  ): DataPt {
    // Add the inputs to the public output buffer
    let outWireIndex = this.placements.get(PUB_OUT_PLACEMENT_INDEX)!.outPts
      .length;
    for (let i = 0; i < inPts.length; i++) {
      const outPtRaw: CreateDataPointParams = {
        extDest: 'KeccakIn',
        key: '0x' + keccakKey.toString(16),
        offset: i,
        source: PUB_OUT_PLACEMENT_INDEX,
        wireIndex: outWireIndex++,
        value: inPts[i].value,
        sourceSize: DEFAULT_SOURCE_SIZE,
      };
      const outPt = DataPointFactory.create(outPtRaw);
      this._addWireToOutBuffer(inPts[i], outPt, PUB_OUT_PLACEMENT_INDEX);
    }

    // Add the output to the public input buffer
    const inPtRaw: CreateDataPointParams = {
      extSource: 'KeccakOut',
      key: '0x' + keccakKey.toString(16),
      source: PUB_IN_PLACEMENT_INDEX,
      wireIndex: this.placements.get(PUB_IN_PLACEMENT_INDEX)!.inPts.length,
      value: outValue,
      sourceSize: DEFAULT_SOURCE_SIZE,
    };
    const inPt = DataPointFactory.create(inPtRaw);
    return this._addWireToInBuffer(inPt, PUB_IN_PLACEMENT_INDEX);
  }

  public loadAndStoreKeccak(
    inPts: DataPt[],
    outValue: bigint,
    length: bigint,
  ): DataPt {
    const { value, inValues } = this._processKeccakInputs(inPts, length);
    this._executeAndValidateKeccak(value, length, outValue);

    this.keccakPt.push({ inValues, outValue });
    const keccakKey = BigInt(this.keccakPt.length - 1);

    return this._recordKeccakToBuffers(inPts, outValue, keccakKey);
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
    // MSTORE8 is used as truncSize=1, storing only the lowest 1 byte of data and discarding the rest.
    if (truncSize < dataPt.sourceSize) {
      // Since there is a modification in the original data, create a virtual operation to track this in Placements.
      // MSTORE8's modification is possible with AND operation (= AND(data, 0xff))
      const maskerString = '0x' + 'FF'.repeat(truncSize);

      const outValue = dataPt.value & BigInt(maskerString);
      if (dataPt.value !== outValue) {
        const subcircuitName = 'AND';
        const inPts: DataPt[] = [this.loadAuxin(BigInt(maskerString)), dataPt];
        const rawOutPt: CreateDataPointParams = {
          source: this.placementIndex,
          wireIndex: 0,
          value: outValue,
          sourceSize: truncSize,
        };
        const outPts: DataPt[] = [DataPointFactory.create(rawOutPt)];
        this._place(subcircuitName, inPts, outPts, subcircuitName);

        return outPts[0];
      }
    }
    const outPt = dataPt;
    outPt.sourceSize = truncSize;
    return outPt;
  }

  /**
   * Adds a new MLOAD placement.
   *
   * MLOAD is one of the Ethereum Virtual Machine (EVM) opcodes, which loads 32 bytes (256 bits) of data from memory.
   * @param {DataAliasInfos} dataAliasInfos - Array containing data source and modification information.
   * @returns {DataPt} Generated data point.
   */
  public placeMemoryToStack(dataAliasInfos: DataAliasInfos): DataPt {
    if (dataAliasInfos.length === 0) {
      throw new Error(`Synthesizer: placeMemoryToStack: Noting tho load`);
    }
    return this._combineMemorySlices(dataAliasInfos);
  }

  public placeMemoryToMemory(dataAliasInfos: DataAliasInfos): DataPt[] {
    if (dataAliasInfos.length === 0) {
      throw new Error(`Synthesizer: placeMemoryToMemory: Nothing to load`);
    }
    const copiedDataPts: DataPt[] = [];
    for (const info of dataAliasInfos) {
      // the lower index, the older data
      copiedDataPts.push(this._applyMask(info, true));
    }
    return copiedDataPts;
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
    const operation = OPERATION_MAPPING[name];
    if (name === 'Accumulator') {
      return operation(values);
    } else {
      return operation(...values);
    }
  }

  private _createArithmeticOutput(
    name: ArithmeticOperator,
    inPts: DataPt[],
  ): DataPt[] {
    const values = inPts.map((pt) => pt.value);
    const outValue = this.executeOperation(name, values);

    const source = this.placementIndex;
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

  private _prepareSubcircuitInputs(
    name: ArithmeticOperator,
    inPts: DataPt[],
  ): { subcircuitName: SubcircuitNames; finalInPts: DataPt[] } {
    const [subcircuitName, selector] = SUBCIRCUIT_MAPPING[name];

    if (this.subcircuitInfoByName.get(subcircuitName) === undefined) {
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
   * Adds a new arithmetic placement.
   *
   * @param {string} name - Name of the placement. Examples: 'ADD', 'SUB', 'MUL', 'DIV'.
   * @param {DataPt[]} inPts - Array of input data points.
   * @returns {DataPt[]} Array of generated output data points.
   * @throws {Error} If an undefined subcircuit name is provided.
   */
  public placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[] {
    try {
      const outPts = this._createArithmeticOutput(name, inPts);
      const { subcircuitName, finalInPts } = this._prepareSubcircuitInputs(
        name,
        inPts,
      );
      this._place(subcircuitName, finalInPts, outPts, name);

      return outPts;
    } catch (error) {
      if (error instanceof InvalidInputCountError) {
        /*eslint-disable*/
        console.error(`Invalid input count for ${name}: ${error.message}`);
      }
      if (error instanceof SynthesizerError) {
        /*eslint-disable*/
        console.error(`Synthesizer error in ${name}: ${error.message}`);
      }
      throw error;
    }
  }

  private _calculateViewAdjustment(
    memoryPt: MemoryPts[number],
    srcOffset: number,
    dstOffset: number,
    viewLength: number,
  ) {
    const { memOffset: containerOffset, containerSize } = memoryPt;
    const containerEndPos = containerOffset + containerSize;

    const actualOffset = Math.max(srcOffset, containerOffset);
    const actualEndPos = Math.min(srcOffset + viewLength, containerEndPos);

    const adjustedOffset = actualOffset - srcOffset + dstOffset;
    const actualContainerSize = actualEndPos - actualOffset;
    const endingGap = containerEndPos - actualEndPos;

    return { adjustedOffset, actualContainerSize, endingGap };
  }

  private _truncateDataPt(dataPt: DataPt, endingGap: number): DataPt {
    if (endingGap <= 0) {
      return dataPt;
    }
    // SHR data to truncate the ending part
    const [truncatedPt] = this.placeArith('SHR', [
      this.loadAuxin(BigInt(endingGap * 8)),
      dataPt,
    ]);
    return truncatedPt;
  }

  public adjustMemoryPts(
    dataPts: DataPt[],
    memoryPts: MemoryPts,
    srcOffset: number,
    dstOffset: number,
    viewLength: number,
  ): void {
    for (const [index, memoryPt] of memoryPts.entries()) {
      const { adjustedOffset, actualContainerSize, endingGap } =
        this._calculateViewAdjustment(
          memoryPt,
          srcOffset,
          dstOffset,
          viewLength,
        );

      memoryPt.memOffset = adjustedOffset;
      memoryPt.containerSize = actualContainerSize;
      memoryPt.dataPt = this._truncateDataPt(dataPts[index], endingGap);
    }
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
    const transformedSlices = dataAliasInfos.map((info) =>
      this._transformMemorySlice(info),
    );

    if (transformedSlices.length === 1) {
      return transformedSlices[0];
    }

    if (transformedSlices.length > ACCUMULATOR_INPUT_LIMIT) {
      throw new Error(
        `Synthesizer: Go to qap-compiler and unlimit the number of inputs for the Accumulator.`,
      );
    }

    // placeArith returns an array of outPts, but Accumulator returns one.
    const [accumulatedPt] = this.placeArith('Accumulator', transformedSlices);
    return accumulatedPt;
  }

  /**
   * Applies shift and mask transformations to a single memory slice.
   *
   * @param {DataAliasInfoEntry} info - The memory slice information.
   * @returns {DataPt} The transformed data point.
   */
  private _transformMemorySlice(info: DataAliasInfoEntry): DataPt {
    const shiftedPt = this._applyShift(info);
    const modInfo: DataAliasInfoEntry = {
      dataPt: shiftedPt,
      masker: info.masker,
      shift: info.shift,
    };
    return this._applyMask(modInfo);
  }

  /**
   * Applies shift operation.
   *
   * @param {bigint} shift - Shift value to apply.
   * @param {DataPt} dataPt - Data point.
   * @returns {bigint} Shifted value.
   */
  private _applyShift(info: DataAliasInfoEntry): DataPt {
    const { dataPt: dataPt, shift: shift } = info;
    let outPts = [dataPt];
    if (Math.abs(shift) > 0) {
      // The relationship between shift value and shift direction is defined in MemoryPt
      const subcircuitName: ArithmeticOperator = shift > 0 ? 'SHL' : 'SHR';
      const absShift = Math.abs(shift);
      const inPts: DataPt[] = [this.loadAuxin(BigInt(absShift)), dataPt];
      outPts = this.placeArith(subcircuitName, inPts);
    }
    return outPts[0];
  }

  /**
   * Applies mask operation.
   *
   * @param {string} masker - Mask value to apply.
   * @param {bigint} dataPt - Pointer to apply the mask.
   */
  private _applyMask(info: DataAliasInfoEntry, unshift?: boolean): DataPt {
    let masker = info.masker;
    const { shift, dataPt } = info;
    if (unshift === true) {
      const maskerBigint = BigInt(masker);
      const unshiftMaskerBigint =
        shift > 0
          ? maskerBigint >> BigInt(Math.abs(shift))
          : maskerBigint << BigInt(Math.abs(shift));
      masker = '0x' + unshiftMaskerBigint.toString(16);
    }
    const maskOutValue = dataPt.value & BigInt(masker);
    let outPts = [dataPt];
    if (maskOutValue !== dataPt.value) {
      const inPts: DataPt[] = [this.loadAuxin(BigInt(masker)), dataPt];
      outPts = this.placeArith('AND', inPts);
    }
    return outPts[0];
  }

  private _place(
    name: SubcircuitNames,
    inPts: DataPt[],
    outPts: DataPt[],
    usage: ArithmeticOperations,
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
    addPlacement(this.placements, {
      name,
      usage,
      subcircuitId: this.subcircuitInfoByName.get(name)!.id,
      inPts,
      outPts,
    });
    this.placementIndex++;
  }
}
