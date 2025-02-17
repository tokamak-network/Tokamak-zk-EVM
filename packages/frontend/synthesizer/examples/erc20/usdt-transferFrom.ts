/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx ton-transfer.ts
 */

import { Account, Address, hexToBytes } from "@ethereumjs/util"
import { keccak256 } from 'ethereum-cryptography/keccak'

import { createEVM } from '../../src/constructors.js'
import { finalize } from '../../src/tokamak/core/finalize.js'
import { setupEVMFromCalldata } from "src/tokamak/utils/erc20EvmSetup.js"
import USDT_STORAGE_LAYOUT from "../../constants/storage-layouts/USDT.json" assert { type: "json" };
import USDT_CONTRACT from "../../constants/bytecodes/USDT.json" assert { type: "json" };

// USDT contract bytecode
const contractCode = USDT_CONTRACT.bytecode

const main = async () => {
  const evm = await createEVM()

  // 계정 설정
  const contractAddr = new Address(hexToBytes('0xdac17f958d2ee523a2206206994597c13d831ec7'))

  const calldata = "0x23b872dd00000000000000000000000080f340fcc2e2bccb71a8f92dad61659df3f4c83500000000000000000000000083c41363cbee0081dab75cb841fa24f3db46627e00000000000000000000000000000000000000000000000000000000036e77ef"
    
  const sender = new Address(hexToBytes('0xa152F8bb749c55E9943A3a0A3111D18ee2B3f94E'))

  await setupEVMFromCalldata(evm, contractAddr, hexToBytes(contractCode), USDT_STORAGE_LAYOUT, calldata, sender)

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
