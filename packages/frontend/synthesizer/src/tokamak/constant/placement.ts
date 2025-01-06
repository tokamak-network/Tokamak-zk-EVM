export const LOAD_PLACEMENT_INDEX = 0
export const RETURN_PLACEMENT_INDEX = 1
export const KECCAK_IN_PLACEMENT_INDEX = 2
export const KECCAK_OUT_PLACEMENT_INDEX = 3
export const INITIAL_PLACEMENT_INDEX = KECCAK_OUT_PLACEMENT_INDEX + 1
export const DEFAULT_SOURCE_SIZE = 32
export const LOAD_PLACEMENT = {
  name: 'InterfaceBufferIn',
  inPts: [],
  outPts: [],
}
export const KECCAK_IN_PLACEMENT = {
  name: 'KeccakBufferIn',
  inPts: [],
  outPts: [],
}
export const KECCAK_OUT_PLACEMENT = {
  name: 'KeccakBufferOut',
  inPts: [],
  outPts: [],
}
export const RETURN_PLACEMENT = {
  name: 'InterfaceBufferOut',
  inPts: [],
  outPts: [],
}
