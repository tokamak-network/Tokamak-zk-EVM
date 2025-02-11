/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx erc20-transfer.ts
 */

import { Account, Address, hexToBytes } from "@ethereumjs/util/index.js"
import { keccak256 } from 'ethereum-cryptography/keccak'

import { createEVM } from '../../src/constructors.js'
import { finalize } from '../../src/tokamak/core/finalize.js'
import ERC20_CONTRACTS from '../../constants/bytecodes/ERC20_CONTRACTS.json' assert { type: "json" };


// USDT contract bytecode
const contractCode = ERC20_CONTRACTS.USDT

const main = async () => {
  const evm = await createEVM()

  // 계정 설정
  const contractAddr = new Address(hexToBytes('0x2be5e8c109e2197D077D13A82dAead6a9b3433C5'))
 
  const calldata = "0xa9059cbb0000000000000000000000000ce8f6c9d4ad12e56e54018313761487d2d1fee900000000000000000000000000000000000000000000006c6b935b8bbd400000"
  const sender = new Address(hexToBytes('0xc2C30E79392A2D1a05288B172f205541a56FC20d'))

  await setupEVMFromCalldata(evm, contractAddr, hexToBytes(contractCode), TON_STORAGE_LAYOUT, calldata, sender)
    

  // Now run the transfer
  const result = await evm.runCode({
    caller: sender,
    to: contractAddr,
    code: hexToBytes(contractCode),
    data: hexToBytes(
      "0xa9059cbb0000000000000000000000005b69d13fa22829691c342d839ffd7a00673b79920000000000000000000000000000000000000000000000000000000003dfd240"
    ),
  })

  console.log("result", result)

   // Get circuit placements
  console.log('Circuit Placements:', 
    JSON.stringify(result.runState?.synthesizer.placements, null, 2)
  )

  // Generate proof
  const permutation = await finalize(result.runState!.synthesizer.placements, true)
}

void main()
