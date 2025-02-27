export type PermutationData ={
  row: number;
  col: number;
  Y: number;
  Z: number;
}

export type PlacementInstance = {
  placementIndex: number;
  subcircuitId: number;
  instructionName: string;
  inValues: string[];
  outValues: string[];
}
