import { SubcircuitNames } from "src/interface/qapCompiler/configuredTypes.ts";
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
    copy.push({
      ...placement,
      inPts: placement.inPts.slice(),
      outPts: placement.outPts.slice(),
    })
  }
  return copy
}

export type PlacementVariableEntry = {
  subcircuitId: number;
  variables: string[];
  instanceList: string[];
};

export type PlacementVariables = PlacementVariableEntry[];

// export type SynthesizerState = {
//   placements: Placements;
//   auxin: Auxin;
//   envInf: Map<string, { value: bigint; wireIndex: number }>;
//   blkInf: Map<string, { value: bigint; wireIndex: number }>;
//   storagePt: Map<string, DataPt>;
//   logPt: { topicPts: DataPt[]; valPts: DataPt[] }[];
//   keccakPt: { inValues: bigint[]; outValue: bigint }[];
//   TStoragePt: Map<string, Map<bigint, DataPt>>;
// };
