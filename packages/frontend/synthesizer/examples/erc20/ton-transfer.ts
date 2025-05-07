/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx ton-transfer.ts
 */

import { Account, Address, hexToBytes } from "@synthesizer-libs/util"
import { keccak256 } from 'ethereum-cryptography/keccak'

import { createEVM } from '../../src/constructors.js'
import { finalize } from '../../src/tokamak/core/finalize.js'
import { setupEVMFromCalldata } from "src/tokamak/utils/erc20EvmSetup.js"
import TON_STORAGE_LAYOUT from "../../src/constants/storage-layouts/TON.json" assert { type: "json" };
import TON_CONTRACT from "../../src/constants/bytecodes/TON.json" assert { type: "json" };
import { logAfterTransaction } from "examples/utils/balanceUnit.js"
import { getStorageSlot } from "examples/utils/getStorageSlot.js"

// TON contract bytecode
const contractCode = TON_CONTRACT.bytecode

const main = async () => {
  const evm = await createEVM()

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

  const balanceSlot = getStorageSlot(TON_STORAGE_LAYOUT, '_balances')
  logAfterTransaction({
    evm,
    sender,
    balanceSlot,
    contractAddr
  })
  
  // Generate proof
  const permutation = await finalize(result.runState!.synthesizer.placements, undefined, true)
}

void main()