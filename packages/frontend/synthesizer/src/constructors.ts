<<<<<<< HEAD
import { Common, Mainnet } from '@ethereumjs/common/dist/esm/index.js'
import { SimpleStateManager } from '@ethereumjs/statemanager/index.js'

import { NobleBN254 } from './precompiles/index.js'
import { EVMMockBlockchain } from './types.js'

import { EVM } from './index.js'

import type { EVMOpts } from './index.js'

/**
 * Use this async static constructor for the initialization
 * of an EVM object
 *
 * @param createOpts The EVM options
 * @returns A new EVM
 */
export async function createEVM(createOpts?: EVMOpts) {
  const opts = createOpts ?? ({} as EVMOpts)

  opts.bn254 = new NobleBN254()

  if (opts.common === undefined) {
    opts.common = new Common({ chain: Mainnet })
  }

  if (opts.blockchain === undefined) {
    opts.blockchain = new EVMMockBlockchain()
  }

  if (opts.stateManager === undefined) {
    opts.stateManager = new SimpleStateManager()
  }

  return new EVM(opts)
}
=======
import { Common, Mainnet } from '@synthesizer-libs/common'
import { SimpleStateManager } from '@synthesizer-libs/statemanager'

import { NobleBN254 } from './precompiles/index.js'
import { EVMMockBlockchain } from './types.js'

import { EVM } from './index.js'

import type { EVMOpts } from './index.js'

/**
 * Use this async static constructor for the initialization
 * of an EVM object
 *
 * @param createOpts The EVM options
 * @returns A new EVM
 */
export async function createEVM(createOpts?: EVMOpts) {
  const opts = createOpts ?? ({} as EVMOpts)

  opts.bn254 = new NobleBN254()

  if (opts.common === undefined) {
    opts.common = new Common({ chain: Mainnet })
  }

  if (opts.blockchain === undefined) {
    opts.blockchain = new EVMMockBlockchain()
  }

  if (opts.stateManager === undefined) {
    opts.stateManager = new SimpleStateManager()
  }

  return new EVM(opts)
}
>>>>>>> 603bf51d9e02a58183fabb7f7fd08e9580ceef44
