import { SubcircuitNames } from "src/tokamak/interface/qapCompiler/configuredTypes.ts";
import { DataPt } from "./dataStructure.ts";


export type PlacementEntry = {
  name: SubcircuitNames;
  usage: string
  subcircuitId: number;
  inPts: DataPt[];
  outPts: DataPt[];
};

export type Placements = Map<number, PlacementEntry>;

export type PlacementVariableEntry = {
  subcircuitId: number;
  variables: string[];
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
