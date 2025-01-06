/**
 * @property { number } subcircuitId - 서브서킷의 식별자.
 * @property {number} nWire - 서브서킷의 와이어 수.
 * @property {number} outIdx - 출력 인덱스.
 * @property {number} nOut - 출력의 수.
 * @property {number} inIdx - 입력 인덱스.
 * @property {number} nIn - 입력의 수.
 */
export type SubcircuitCode = {
  subcircuitId: number
  nWire: number
  outIdx: number
  nOut: number
  inIdx: number
  nIn: number
}

/**
 * @property {number} code - 서브서킷 코드.
 * @property {string} name - 서브서킷 이름.
 * @property {number} nWire - 서브서킷의 와이어 수.
 * @property {number} outIdx - 출력 인덱스.
 * @property {number} nOut - 출력의 수.
 * @property {number} inIdx - 입력 인덱스.
 * @property {number} nIn - 입력의 수.
 */
export type SubcircuitId = {
  code: number
  name: string
  nWire: number
  outIdx: number
  nOut: number
  inIdx: number
  nIn: number
}

/**
 * @property {string | number } source - Where the data is from. If the source is a string, it should be a stringfied address of which the code is running. If it is a number, it is a placement key.  See "functions.ts" for detail
 * @property {string} type? - The type of data, when the source is either an address or 'block'. E.g., 'hardcoded', 'BLOCKHASH', 'CALLDATA'. See "functions.ts" for detail
 * @property {number} wireIndex? - The index of wire at which the data is from, when the source is a placement key (= subcircuit).
 * @property {number} offset? - The offset at which the data is read, when the source is string and the type either 'hardcoded' or 'CALLDATA'.
 * @property {number} sourceSize - 데이터의 실제 크기.
 * @property {bigint} value - 데이터 값.
 */
export interface CreateDataPointParams {
  source?: string | number
  type?: string
  key?: bigint
  offset?: number
  wireIndex?: number
  pairedInputWireIndices?: number[]
  dest?: string
  sourceSize: number
  value: bigint
  identifier?: string
}
export type DataPt = CreateDataPointParams & { valueHex: string }

export type PlacementEntry = {
  name: string
  subcircuitId?: number
  inPts: DataPt[]
  outPts: DataPt[]
}

export type Placements = Map<number, PlacementEntry>
export type Auxin = Map<bigint, number>

export type PlacementInstanceEntry = {
  placementIndex: number
  subcircuitId: number
  instructionName: string
  inValues: string[]
  outValues: string[]
}

export type PlacementInstances = PlacementInstanceEntry[]
