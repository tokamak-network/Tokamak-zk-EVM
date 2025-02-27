export const DEFAULT_SOURCE_SIZE = 32

export const STORAGE_IN_PLACEMENT_INDEX = 0
export const STORAGE_OUT_PLACEMENT_INDEX = 1
export const LOAD_PLACEMENT_INDEX = 2
export const RETURN_PLACEMENT_INDEX = 3
export const KECCAK_IN_PLACEMENT_INDEX = 4
export const KECCAK_OUT_PLACEMENT_INDEX = 5
export const INITIAL_PLACEMENT_INDEX = KECCAK_OUT_PLACEMENT_INDEX + 1

export const STORAGE_IN_PLACEMENT = {
  name: 'bufferPubInPrvOut',
  usage: 'Buffer to load public circuit inputs',
  inPts: [],
  outPts: [],
}
export const STORAGE_OUT_PLACEMENT = {
  name: 'bufferPrvInPubOut',
  usage: 'Buffer to emit public circuit outputs',
  inPts: [],
  outPts: [],
}
export const LOAD_PLACEMENT = {
  name: 'bufferPrvInPrvOut',
  usage: 'Buffer to load private circuit inputs',
  inPts: [],
  outPts: [],
}
export const RETURN_PLACEMENT = {
  name: 'bufferPrvInPrvOut',
  usage: 'Buffer to emit private circuit outputs',
  inPts: [],
  outPts: [],
}
export const KECCAK_IN_PLACEMENT = {
  name: 'bufferPrvInPubOut',
  usage: 'Buffer to emit external Keccak inputs', 
  inPts: [],
  outPts: [],
}
export const KECCAK_OUT_PLACEMENT = {
  name: 'bufferPubInPrvOut',
  usage: 'Buffer to load external Keccak outputs',
  inPts: [],
  outPts: [],
}