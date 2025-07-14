// Wire mapping types for better type safety
export type GlobalWireEntry = [subcircuitId: number, localWireIndex: number];
export type GlobalWireList = GlobalWireEntry[];

export type SubcircuitNames =
  | 'bufferPubOut'
  | 'bufferPubIn'
  | 'bufferPrvOut'
  | 'bufferPrvIn'
  | 'ALU1'
  | 'ALU2'
  | 'ALU3'
  | 'ALU4'
  | 'ALU5'
  | 'AND'
  | 'OR'
  | 'XOR'
  | 'DecToBit'
  | 'Accumulator';

export type SubcircuitInfoByNameEntry = {
  id: number;
  NWires: number;
  inWireIndex: number;
  NInWires: number;
  outWireIndex: number;
  NOutWires: number;
  flattenMap?: number[];
};

// Extended version with required flattenMap for runtime use
export type SubcircuitInfoWithFlattenMap = Omit<
  SubcircuitInfoByNameEntry,
  'flattenMap'
> & {
  flattenMap: number[];
};

export type SubcircuitInfoByName = Map<
  SubcircuitNames,
  SubcircuitInfoByNameEntry
>;

// Type guard to check if subcircuit has flattenMap
export function hasValidFlattenMap(
  subcircuit: SubcircuitInfoByNameEntry,
): subcircuit is SubcircuitInfoWithFlattenMap {
  return (
    Array.isArray(subcircuit.flattenMap) && subcircuit.flattenMap.length > 0
  );
}

// Type guard to check if a string is a valid SubcircuitNames
export function isValidSubcircuitName(name: string): name is SubcircuitNames {
  const validNames: SubcircuitNames[] = [
    'bufferPubOut',
    'bufferPubIn',
    'bufferPrvOut',
    'bufferPrvIn',
    'ALU1',
    'ALU2',
    'ALU3',
    'ALU4',
    'ALU5',
    'AND',
    'OR',
    'XOR',
    'DecToBit',
    'Accumulator',
  ];
  return validNames.includes(name as SubcircuitNames);
}
