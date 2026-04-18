import { DataPt, ISynthesizerProvider } from '../types/index.ts';
import { ArithmeticOperator } from '../../interface/qapCompiler/configuredTypes.ts';
export declare class ArithmeticManager {
    private parent;
    constructor(parent: ISynthesizerProvider);
    /**
     * Creates the output data points for an arithmetic operation.
     *
     * @param {ArithmeticOperator} name - The name of the arithmetic operation.
     * @param {DataPt[]} inPts - The input data points for the operation.
     * @returns {DataPt[]} An array of output data points.
     */
    private _createArithmeticOutput;
    private _normalizeMerkleProofInputs;
    private _normalizePoseidonInputs;
    /**
     * Prepares the inputs for a subcircuit, including any required selectors.
     *
     * @param {ArithmeticOperator} name - The name of the arithmetic operation.
     * @param {DataPt[]} inPts - The input data points.
     * @returns {{ subcircuitName: SubcircuitNames; finalInPts: DataPt[] }} The name of the subcircuit and the final input data points.
     */
    private _prepareSubcircuitInputs;
    /**
     * Places an arithmetic operation in the synthesizer.
     *
     * This involves creating output data points, preparing inputs, and adding the placement.
     *
     * @param {ArithmeticOperator} name - The name of the arithmetic operation.
     * @param {DataPt[]} inPts - The input data points.
     * @returns {DataPt[]} The output data points from the operation.
     */
    placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[];
    placePoseidon(inPts: DataPt[]): DataPt;
    placeExp(inPts: DataPt[], reference?: bigint): DataPt;
    placeJubjubExp(inPts: DataPt[], PoI: DataPt[], reference?: bigint): DataPt[];
    placeMerkleProofVerification(indexPt: DataPt, leafPt: DataPt, siblingPts: DataPt[][], rootPt: DataPt): void;
}
//# sourceMappingURL=arithmeticManager.d.ts.map