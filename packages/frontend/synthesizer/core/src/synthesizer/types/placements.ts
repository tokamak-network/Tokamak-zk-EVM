import { SubcircuitNames } from "../../subcircuit/configuredTypes.ts";
import { DataPt } from "./dataStructure.ts";


export type PlacementEntry = {
  name: SubcircuitNames;
  usage: string
  subcircuitId: number;
  inPts: DataPt[];
  outPts: DataPt[];
};

export type Placements = PlacementEntry[];

export function placementEntryDeepCopy(placement: PlacementEntry): PlacementEntry {
  return {
    ...placement,
    inPts: placement.inPts.slice(),
    outPts: placement.outPts.slice(),
  }
}

export function placementsDeepCopy(placements: Placements): Placements {
  const copy: Placements = []
  for (const placement of placements) {
    copy.push(placementEntryDeepCopy(placement))
  }
  return copy
}

export type CompositionOperands = readonly DataPt[] | readonly (readonly DataPt[])[];

export type PlacementVariableEntry = {
  subcircuitId: number;
  variables: string[];
  instanceList: string[];
};

export type PlacementVariables = PlacementVariableEntry[];
