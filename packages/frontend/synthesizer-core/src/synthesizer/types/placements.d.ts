import { SubcircuitNames } from "../../interface/qapCompiler/configuredTypes.ts";
import { DataPt } from "./dataStructure.ts";
export type PlacementEntry = {
    name: SubcircuitNames;
    usage: string;
    subcircuitId: number;
    inPts: DataPt[];
    outPts: DataPt[];
};
export type Placements = PlacementEntry[];
export declare function placementEntryDeepCopy(placement: PlacementEntry): PlacementEntry;
export declare function placementsDeepCopy(placements: Placements): Placements;
export type PlacementVariableEntry = {
    subcircuitId: number;
    variables: string[];
    instanceList: string[];
};
export type PlacementVariables = PlacementVariableEntry[];
//# sourceMappingURL=placements.d.ts.map