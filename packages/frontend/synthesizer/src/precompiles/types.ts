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
