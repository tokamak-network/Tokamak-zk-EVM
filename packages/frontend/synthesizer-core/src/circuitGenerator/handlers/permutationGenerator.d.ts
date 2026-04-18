import { CircuitGenerator } from '../circuitGenerator.ts';
import { Permutation } from '../types/types.ts';
export declare class PermutationGenerator {
    private parent;
    private flattenMapInverse;
    private placementVariables;
    private circuitPlacements;
    private permGroup;
    private permutationY;
    private permutationX;
    permutation: Permutation;
    constructor(parent: CircuitGenerator);
    private _retrieveDataPtFromPlacementWireId;
    private _correctPermutation;
    private _buildPermGroup;
    private _validatePermutation;
    private _keyOf;
}
//# sourceMappingURL=permutationGenerator.d.ts.map