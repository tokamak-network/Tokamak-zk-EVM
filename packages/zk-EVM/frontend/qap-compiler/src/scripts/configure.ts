export const S_MAX = 256

export type PublicType = 'outUser' | 'inUser' | 'inBlock' | 'inFunction'

export const LIST_PUBLIC = new Map<string, PublicType>([
  ['bufferPubOut', 'outUser'],
  ['bufferPubIn', 'inUser'],
  ['bufferBlockIn', 'inBlock'],
  ['bufferEVMIn', 'inFunction'],
])
