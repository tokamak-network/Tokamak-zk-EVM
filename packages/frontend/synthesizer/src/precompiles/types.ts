<<<<<<< HEAD
import type { EVMInterface, ExecResult } from '../types.js'
import type { Common } from '@ethereumjs/common/dist/esm/index.js'
import type { debug } from 'debug'

export interface PrecompileFunc {
  (input: PrecompileInput): Promise<ExecResult> | ExecResult
}

export interface PrecompileInput {
  data: Uint8Array
  gasLimit: bigint
  common: Common
  _EVM: EVMInterface
  _debug?: debug.Debugger
}
=======
import type { EVMInterface, ExecResult } from '../types.js'
import type { Common } from '@synthesizer-libs/common'
import type { debug } from 'debug'

export interface PrecompileFunc {
  (input: PrecompileInput): Promise<ExecResult> | ExecResult
}

export interface PrecompileInput {
  data: Uint8Array
  gasLimit: bigint
  common: Common
  _EVM: EVMInterface
  _debug?: debug.Debugger
}
>>>>>>> 603bf51d9e02a58183fabb7f7fd08e9580ceef44
