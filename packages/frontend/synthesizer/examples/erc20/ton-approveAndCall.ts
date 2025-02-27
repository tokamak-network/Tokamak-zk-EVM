/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx ton-transfer.ts
 */

import { Account, Address, hexToBytes } from "@ethereumjs/util/index.js"
import { keccak256 } from 'ethereum-cryptography/keccak'

import { createEVM } from '../../src/constructors.js'
import { finalize } from '../../src/tokamak/core/finalize.js'
import { setupEVMFromCalldata } from "src/tokamak/utils/erc20EvmSetup.js"
import TON_STORAGE_LAYOUT from "../../constants/storage-layouts/TON.json" assert { type: "json" };
import ERC20_CONTRACTS from "../../constants/bytecodes/ERC20_CONTRACTS.json" assert { type: "json" };

// USDC contract bytecode
const contractCode = ERC20_CONTRACTS.TON

const main = async () => {
  const evm = await createEVM()

  const contractAddr = new Address(hexToBytes('0x2be5e8c109e2197D077D13A82dAead6a9b3433C5'))
 
    /**
     * https://etherscan.io/tx/0xe9a94df2131bf150aed4cc13b3cbd7addc455420e9250d8cb0f838d65f9a0866
     */
  const calldata = "0xcae9ca51000000000000000000000000c4a11aaf6ea915ed7ac194161d2fc9384f15bff20000000000000000000000000000000000000000000001a16af753a6cbd000000000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000004000000000000000000000000056e465f654393fa48f007ed7346105c7195cee4300000000000000000000000042ccf0769e87cb2952634f607df1c7d62e0bbc52"

  const sender = new Address(hexToBytes('0x942d6ac7A6702Bb1852676f3f22AeE38bD442E4C'))

  await setupEVMFromCalldata(evm, contractAddr, hexToBytes(contractCode), TON_STORAGE_LAYOUT, calldata, sender)

  // allowance 슬롯 확인을 위한 키 생성
  const allowanceSlot = '1' // TON의 allowance 매핑 슬롯
  const allowanceKey = keccak256(
    hexToBytes(
      '0x' + sender.toString().slice(2).padStart(64, '0') +
      '000000000000000000000000ce8f6c9d4ad12e56e54018313761487d2d1fee9' +
      allowanceSlot.padStart(64, '0')
    )
  )

  // 실행 전 allowance 확인
  console.log("\n=== Before ApproveAndCall ===")
  const allowanceBefore = await evm.stateManager.getStorage(contractAddr, allowanceKey)
  console.log("Allowance before:", Buffer.from(allowanceBefore).toString('hex'))

  // approveAndCall 실행
  const result = await evm.runCode({
    caller: sender,
    to: contractAddr,
    code: hexToBytes(contractCode),
    data: hexToBytes(calldata),
  })

  // 실행 결과 확인
  console.log("\n=== Execution Result ===")
  console.log('Exception:', result.exceptionError)

  // 실행 후 allowance 확인
  console.log("\n=== After ApproveAndCall ===")
  const allowanceAfter = await evm.stateManager.getStorage(contractAddr, allowanceKey)
  console.log("Allowance after:", Buffer.from(allowanceAfter).toString('hex'))

  // Generate proof
  const permutation = await finalize(result.runState!.synthesizer.placements, undefined, true)
}

void main().catch(console.error)
