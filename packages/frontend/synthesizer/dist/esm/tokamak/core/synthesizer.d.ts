import type { RunState } from '../../interpreter.js';
import type { DataAliasInfos, MemoryPts } from '../pointers/index.js';
import type { ArithmeticOperator, Auxin, DataPt, Placements, SubcircuitInfoByName } from '../types/index.js';
export declare const synthesizerArith: (op: ArithmeticOperator, ins: bigint[], out: bigint, runState: RunState) => void;
export declare const synthesizerBlkInf: (op: string, runState: RunState, target?: bigint) => void;
export declare function prepareEXTCodePt(runState: RunState, target: bigint, _offset?: bigint, _size?: bigint): Promise<DataPt>;
export declare function synthesizerEnvInf(op: string, runState: RunState, target?: bigint, offset?: bigint): Promise<void>;
/**
 * The Synthesizer class manages data related to subcircuits.
 *
 * @property {Placements} placements - Map storing subcircuit placement information.
 * @property {bigint[]} auxin - Array storing auxiliary input data.
 * @property {number} placementIndex - Current placement index.
 * @property {string[]} subcircuitNames - Array storing subcircuit names.
 */
export declare class Synthesizer {
    placements: Placements;
    auxin: Auxin;
    envInf: Map<string, {
        value: bigint;
        wireIndex: number;
    }>;
    blkInf: Map<string, {
        value: bigint;
        wireIndex: number;
    }>;
    storagePt: Map<string, DataPt>;
    logPt: {
        topicPts: DataPt[];
        valPt: DataPt;
    }[];
    TStoragePt: Map<string, Map<bigint, DataPt>>;
    protected placementIndex: number;
    private subcircuitNames;
    readonly subcircuitInfoByName: SubcircuitInfoByName;
    constructor();
    /**
     * Adds a new input-output pair to the LOAD subcircuit.
     * @param pointerIn - Input data point
     * @returns Generated output data point
     * @private
     */
    private _addWireToLoadPlacement;
    /**
     * Adds a new input-output pair to the LOAD placement caused by the PUSH instruction.
     *
     * @param {string} codeAddress - Address of the code where PUSH was executed.
     * @param {number} programCounter - Program counter of the PUSH input argument.
     * @param {bigint} value - Value of the PUSH input argument.
     * @returns {void}
     */
    loadPUSH(codeAddress: string, programCounter: number, value: bigint, size: number): DataPt;
    loadAuxin(value: bigint): DataPt;
    loadEnvInf(codeAddress: string, type: string, value: bigint, _offset?: number, size?: number): DataPt;
    loadStorage(codeAddress: string, key: bigint, value: bigint): DataPt;
    storeStorage(codeAddress: string, key: bigint, inPt: DataPt): void;
    storeLog(valPt: DataPt, topicPts: DataPt[]): void;
    loadBlkInf(blkNumber: bigint, type: string, value: bigint): DataPt;
    loadKeccak(inPts: DataPt[], outValue: bigint, length?: bigint): DataPt;
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
    placeMSTORE(dataPt: DataPt, truncSize: number): DataPt;
    placeEXP(inPts: DataPt[]): DataPt;
    /**
     * Adds a new MLOAD placement.
     *
     * MLOAD is one of the Ethereum Virtual Machine (EVM) opcodes, which loads 32 bytes (256 bits) of data from memory.
     * @param {DataAliasInfos} dataAliasInfos - Array containing data source and modification information.
     * @returns {DataPt} Generated data point.
     */
    placeMemoryToStack(dataAliasInfos: DataAliasInfos): DataPt;
    placeMemoryToMemory(dataAliasInfos: DataAliasInfos): DataPt[];
    /**
    @todo: newDataPt size 변수 검증 필요
     */
    private static readonly REQUIRED_INPUTS;
    private validateOperation;
    private executeOperation;
    private createOutputPoint;
    private handleBinaryOp;
    /**
     * Adds a new arithmetic placement.
     *
     * @param {string} name - Name of the placement. Examples: 'ADD', 'SUB', 'MUL', 'DIV'.
     * @param {DataPt[]} inPts - Array of input data points.
     * @returns {DataPt[]} Array of generated output data points.
     * @throws {Error} If an undefined subcircuit name is provided.
     */
    placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[];
    adjustMemoryPts: (dataPts: DataPt[], memoryPts: MemoryPts, srcOffset: number, dstOffset: number, viewLength: number) => void;
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
     * Creates a data point from an array of data sources and modification information.
     *
     * @param {DataAliasInfos} dataAliasInfos - Array containing data source and modification information.
     * @returns {DataPt} Generated data point.
     */
    private _resolveDataAlias;
    private _applyShiftAndMask;
    /**
     * Applies shift operation.
     *
     * @param {bigint} shift - Shift value to apply.
     * @param {DataPt} dataPt - Data point.
     * @returns {bigint} Shifted value.
     */
    private _applyShift;
    /**
     * Applies mask operation.
     *
     * @param {string} masker - Mask value to apply.
     * @param {bigint} dataPt - Pointer to apply the mask.
     */
    private _applyMask;
    /**
     * Adds all AND results together.
     *
     * @param {{subcircuitID: number, wireID: number}[]} addTargets - OR operation target indices array.
     */
    private _addAndPlace;
    private _place;
}
//# sourceMappingURL=synthesizer.d.ts.map