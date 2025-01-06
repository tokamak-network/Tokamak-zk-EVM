// DEBUG=ethjs,evm:*,evm:*:* tsx callcodes.ts
import { Common, Mainnet } from '@ethereumjs/common'
import { SimpleStateManager } from '@ethereumjs/statemanager'
import { Account, createAddressFromPrivateKey, hexToBytes } from '@ethereumjs/util'

import { createEVM } from '../src/constructors.js'
import { NobleBN254 } from '../src/precompiles/index.js'
import { EVMMockBlockchain } from '../src/types.js'

import type { EVMOpts } from '../src/index.js'

const main = async () => {
  const opts = {} as EVMOpts
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

  // State에 임의의 contract account 추가
  const anyBytes = new Uint8Array(32)
  anyBytes[31] = 1
  const address = createAddressFromPrivateKey(anyBytes)
  console.log(`Contract address: ${address.toString()}`) // 0x7e5f4552091a69125d5dfcb7b8c2659029395bdf
  const account = new Account(0n, 0xfffffn)
  await opts.stateManager.putAccount(address, account)

  const callcode = hexToBytes(
    '0x60013560081c60016000601F3760005102808065ffff000000001660601b9063ffff00001665b01d000000000160301b9161ffff1660101b61c01a01010160005260206000f3',
  )
  // contract account의 코드 정의
  await opts.stateManager.putCode(address, callcode)

  const evm = await createEVM(opts)
  const res = await evm.runCode({
    data: hexToBytes('0x0000000000000000000000000000000100000000000000000000000000000001'),
    code: hexToBytes(
      '0x60103560801c6010600060103760005163c0cac01a60225263b01dface601e52611eaf601c52026020536020602060206020737e5f4552091a69125d5dfcb7b8c2659029395bdf611388fa60205180807f000000000000000000000000000000000000000000000000ffffffffffffffff16917f00000000000000000000000000000000ffffffffffffffff00000000000000001660401c907f0000000000000000ffffffffffffffff000000000000000000000000000000001660801c611eaf1460005363b01dface1460015363c0cac01a1460025300',
    ),
  })
  console.log(res.executionGasUsed) // 3n
}

void main()
