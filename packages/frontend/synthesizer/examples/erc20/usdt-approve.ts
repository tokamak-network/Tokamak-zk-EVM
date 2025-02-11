/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx ton-transfer.ts
 */

import { Account, Address, hexToBytes } from "@ethereumjs/util/index.js"
import { keccak256 } from 'ethereum-cryptography/keccak'

import { createEVM } from '../../src/constructors.js'
import { finalize } from '../../src/tokamak/core/finalize.js'
import { setupEVMFromCalldata } from "src/tokamak/utils/evmSetup.js"
import USDT_STORAGE_LAYOUT from "../../constants/storage-layouts/USDT.json" assert { type: "json" };
import ERC20_CONTRACTS from "../../constants/bytecodes/ERC20_CONTRACTS.json" assert { type: "json" };

// USDT contract bytecode
const contractCode = ERC20_CONTRACTS.USDT

const main = async () => {
  const evm = await createEVM()

  // 계정 설정
  const contractAddr = new Address(hexToBytes('0xdac17f958d2ee523a2206206994597c13d831ec7'))

  const calldata = "0x095ea7b3000000000000000000000000881d40237659c251811cec9c364ef91dc08d300cffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    
  const sender = new Address(hexToBytes('0xb723F4f3721369A8339B078985Ec8fae9BAeCb75'))

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
