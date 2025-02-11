/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx ton-transfer.ts
 */

import { Account, Address, hexToBytes } from "@ethereumjs/util/index.js"
import { keccak256 } from 'ethereum-cryptography/keccak'

import { createEVM } from '../../src/constructors.js'
import { finalize } from '../../src/tokamak/core/finalize.js'
import { setupEVMFromCalldata } from "src/tokamak/utils/evmSetup.js"
import TON_STORAGE_LAYOUT from "../../constants/storage-layouts/TON.json" assert { type: "json" };
import ERC20_CONTRACTS from "../../constants/bytecodes/ERC20_CONTRACTS.json" assert { type: "json" };

// USDC contract bytecode
const contractCode = ERC20_CONTRACTS.TON

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
      calldata
    ),
  })

  console.log('result', result)

  
  // Generate proof
  const permutation = await finalize(result.runState!.synthesizer.placements, undefined, true)
}

void main()
