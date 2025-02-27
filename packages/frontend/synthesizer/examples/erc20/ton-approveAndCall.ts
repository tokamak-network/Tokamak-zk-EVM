/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx ton-transfer.ts
 */

import { Account, Address, hexToBytes } from "@synthesizer-libs/util"
import { keccak256 } from 'ethereum-cryptography/keccak'

import { createEVM } from '../../src/constructors.js'
import { finalize } from '../../src/tokamak/core/finalize.js'
import { setupEVMFromCalldata } from "../../src/tokamak/utils/erc20EvmSetup.js"
import TON_STORAGE_LAYOUT from "../../src/constants/storage-layouts/TON.json" 
import TON_CONTRACT from "../../src/constants/bytecodes/TON.json" 
import ERC20_ADDRESSES from "../../src/constants/addresses/ERC20_ADDRESSES.json"
import WTON_STORAGE_LAYOUT from "../../src/constants/storage-layouts/WTON.json"
import WTON_CONTRACT from "../../src/constants/bytecodes/WTON.json"
import CONTRACTS from "../../src/constants/addresses/CONTRACTS.json"
import CANDIDATE from "../../src/constants/bytecodes/CANDIDATE.json"
import SWAP_PROXY from "../../src/constants/bytecodes/SWAP_PROXY.json"
const tonContractCode = TON_CONTRACT.bytecode
const wtonContractCode = WTON_CONTRACT.bytecode
const candidateContractCode = CANDIDATE.bytecode
const swapProxyContractCode = SWAP_PROXY.bytecode
 // 문자열을 hex로 변환하는 함수
function stringToHex(str: string): string {
  return '0x' + Buffer.from(str).toString('hex').padStart(64, '0');
}

const main = async () => {
  const evm = await createEVM()

  const tonAddr = new Address(hexToBytes(ERC20_ADDRESSES.TON))
  const wtonAddr = new Address(hexToBytes(ERC20_ADDRESSES.WTON))
  const swapProxyAddr = new Address(hexToBytes(CONTRACTS.swapProxy))

    /**
     * https://etherscan.io/tx/0xd42e4e41f4c2bf07e72cd05a0c33bcba7e29f008fc8756de9f6527f93608049a
     */
  
  /**
   * 0xcae9ca51 // Function selector for approveAndCall(address,uint256,bytes)  
// Parameters:
000000000000000000000000c4a11aaf6ea915ed7ac194161d2fc9384f15bff2 // address spender (WTON contract)
0000000000000000000000000000000000000000000003f9b850931928f20000 // uint256 amount (18.2 TON = 18200000000000000000000)
0000000000000000000000000000000000000000000000000000000000000060 // offset for bytes parameter (96 in decimal)
0000000000000000000000000000000000000000000000000000000000000040 // length of bytes data (64 in decimal)
000000000000000000000000b58ca72b12f01fc05f8f252e226f3e2089bd00e0 // first 32 bytes of data
000000000000000000000000f42d1c40b95df7a1478639918fc358b4af5298d  // second 32 bytes of data
   */
  // approve(address,uint256)
// const approveCalldata = '0x095ea7b3' + 
//     // WTON contract address (spender)
//     'c4A11aaf6ea915Ed7Ac194161d2fC9384F15bff2'.padStart(64, '0') +
//     // amount (8750 tokens)
//     '1da56a4b0835bf800000'.padStart(64, '0')

// transfer(address,uint256)
const transferCalldata = "0xa9059cbb000000000000000000000000ea7c74d8286d256fa5d3b51d941608ff166538b9000000000000000000000000000000000000000000000144f66625c71f1a000000"

// approveAndCall(address,uint256,bytes)
const approveAndCallData = "0xcae9ca51000000000000000000000000c4a11aaf6ea915ed7ac194161d2fc9384f15bff2000000000000000000000000000000000000000000000144f66625c71f1a00000000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000004000000000000000000000000030e65b3a6e6868f044944aa0e9c5d52f8dcb138d0000000000000000000000000000000000000000000000000000000000000000"

  const sender = new Address(hexToBytes('0x0e274455110A233Bb7577c73Aa58d75a0939F56E'))

await setupEVMFromCalldata(evm, tonAddr, hexToBytes(tonContractCode), TON_STORAGE_LAYOUT, transferCalldata, sender)
  // await setupEVMFromCalldata(evm, tonAddr, hexToBytes(tonContractCode), TON_STORAGE_LAYOUT, approveCalldata, sender)

   await evm.stateManager.putAccount(wtonAddr, new Account());
  await evm.stateManager.putCode(wtonAddr, hexToBytes(wtonContractCode));

await evm.stateManager.putAccount(swapProxyAddr, new Account());
  await evm.stateManager.putCode(swapProxyAddr, hexToBytes(swapProxyContractCode));

  // Set TON address in WTON's storage
await evm.stateManager.putStorage(
  wtonAddr,
  Buffer.from('a'.padStart(64, '0'), 'hex'),  // slot 0
  Buffer.from(tonAddr.toString().slice(2).padStart(64, '0'), 'hex')  // TON address
)

  // OnApprove interface selector
const onApproveSelector = '0x8d8f8076'  // bytes4(keccak256('onApprove(address,address,uint256,bytes)'))
const erc165InterfaceId = '0x01ffc9a7'  // ERC165 interface ID


  // WTON의 storage slots 0-10 설정
for (let i = 0; i < 11; i++) {
   const slot = i.toString(16).padStart(64, '0')  // hex string padded to 32 bytes
  // Register ERC165 interface ID
  const erc165Key = keccak256(Buffer.concat([
    Buffer.from(erc165InterfaceId.slice(2), 'hex'),
    Buffer.from(slot, 'hex')
  ]))
  await evm.stateManager.putStorage(
    wtonAddr,
    Buffer.from(erc165Key),
    Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex')
  )

  // Register onApprove selector
  const onApproveKey = keccak256(Buffer.concat([
    Buffer.from(onApproveSelector.slice(2), 'hex'),
    Buffer.from(slot, 'hex')
  ]))
  await evm.stateManager.putStorage(
    wtonAddr,
    Buffer.from(onApproveKey),
    Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex')
  )

  const result = await evm.runCode({
    caller: sender,
    to: tonAddr,
    code: hexToBytes(tonContractCode),
    data: hexToBytes(approveAndCallData),
  })

  if (result.exceptionError) {
    console.log('evm:', i)
    console.log("evm return value:", Buffer.from(result.returnValue).toString())
  }
}

  // approveAndCall 실행
  // const result = await evm.runCode({
  //   caller: sender,
  //   to: tonAddr,
  //   code: hexToBytes(tonContractCode),
  //   data: hexToBytes(approveAndCallData),
  // })

  // if (result.exceptionError) {
  //   console.log('evm:', result)
  //   console.log("evm return value:", Buffer.from(result.returnValue).toString())
  // }

  // 실행 후 잔액 확인
  // console.log("\n=== After approveAndCall ===")
  // const tonBalanceAfter = await evm.stateManager.getStorage(tonAddr, tonBalanceKey)
  // const wtonBalanceAfter = await evm.stateManager.getStorage(wtonAddr, wtonBalanceKey)
  // console.log("TON balance after:", Buffer.from(tonBalanceAfter).toString('hex'))
  // console.log("WTON balance after:", Buffer.from(wtonBalanceAfter).toString('hex'))

  // Generate proof
  // const permutation = await finalize(result.runState!.synthesizer.placements, undefined, true)

}

void main().catch(console.error)
