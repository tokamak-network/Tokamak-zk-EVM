import type { PlacementInstances, Placements } from '../types/index.js';
export declare function finalize(placements: Placements, validate?: boolean): Promise<Permutation>;
declare class Permutation {
    private l;
    private l_D;
    private flattenMapInverse;
    private subcircuitInfoByName;
    private _placements;
    private _instances;
    private permGroup;
    permutationY: number[][];
    permutationZ: number[][];
    permutationFile: {
        row: number;
        col: number;
        Y: number;
        Z: number;
    }[];
    constructor(placements: Placements, instances?: PlacementInstances);
    private _outputPermutation;
    private _searchInsert;
    private _buildPermGroup;
    private _validatePermutation;
}
export {};
//# sourceMappingURL=finalize.d.ts.map