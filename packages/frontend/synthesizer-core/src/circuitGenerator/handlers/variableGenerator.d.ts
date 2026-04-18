import { Placements, PlacementVariables } from '../../synthesizer/types/placements.ts';
import { CircuitGenerator } from '../circuitGenerator.ts';
import { PublicInstance, PublicInstanceDescription } from '../types/types.ts';
export declare class VariableGenerator {
    private parent;
    placementsCompatibleWithSubcircuits: Placements | undefined;
    placementVariables: PlacementVariables | undefined;
    publicInstance: PublicInstance | undefined;
    publicInstanceDescription: PublicInstanceDescription | undefined;
    constructor(circuitGenerator: CircuitGenerator);
    private get _subcircuitLibrary();
    initVariableGenerator(): Promise<void>;
    private _prepareCircuitInstance;
    private _generatePlacementVariables;
    private _extractPublicInstance;
    private _extractPublicInstanceDescription;
    private _halveWordSizeOfWires;
    /**
     * Removes EVM_IN wires that are not referenced by any other placement's input points.
     * Returns a new PlacementEntry with filtered inPts and outPts arrays.
     */
    private _removeUnusedWiresFromEVMInBuffer;
    private _convertEVMWiresIntoCircomWires;
    private _validateBufferSizes;
    private _generateSubcircuitWitness;
}
//# sourceMappingURL=variableGenerator.d.ts.map