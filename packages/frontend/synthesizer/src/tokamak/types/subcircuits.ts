export type SubcircuitInfoByNameEntry = {
  id: number
  NWires: number
  inWireIndex: number
  NInWires: number
  outWireIndex: number
  NOutWires: number
  flattenMap?: number[]
}
export type SubcircuitInfoByName = Map<SubcircuitNames, SubcircuitInfoByNameEntry>

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
  | 'Accumulator'
