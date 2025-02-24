/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx ton-transfer.ts
 */

import { Account, Address, hexToBytes } from "@synthesizer-libs/util"
import { keccak256 } from 'ethereum-cryptography/keccak'

import { createEVM } from '../../src/constructors.js'
import { finalize } from '../../src/tokamak/core/finalize.js'
import { setupEVMFromCalldata } from "src/tokamak/utils/erc20EvmSetup.js"
import TON_STORAGE_LAYOUT from "../../src/constants/storage-layouts/TON.json" 
import TON_CONTRACT from "../../src/constants/bytecodes/TON.json" 
import ERC20_ADDRESSES from "../../src/constants/addresses/ERC20_ADDRESSES.json"
import WTON_STORAGE_LAYOUT from "../../src/constants/storage-layouts/WTON.json"
import WTON_CONTRACT from "../../src/constants/bytecodes/WTON.json"

const tonContractCode = TON_CONTRACT.bytecode
const wtonContractCode = WTON_CONTRACT.bytecode

const main = async () => {
  const evm = await createEVM()

  const tonAddr = new Address(hexToBytes(ERC20_ADDRESSES.TON))
  const wtonAddr = new Address(hexToBytes(ERC20_ADDRESSES.WTON))
 
    /**
     * https://etherscan.io/tx/0x96e88bd30e2515f78db95049077bd265104d0a1b7063d8bd85795b74b095f6a8
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
const approveCalldata = '0x095ea7b3' + 
    // WTON contract address (spender)
    'c4A11aaf6ea915Ed7Ac194161d2fC9384F15bff2'.padStart(64, '0') +
    // amount (8750 tokens)
    '1da56a4b0835bf800000'.padStart(64, '0')

// transfer(address,uint256)
const transferCalldata = "0xa9059cbb000000000000000000000000ea7c74d8286d256fa5d3b51d941608ff166538b90000000000000000000000000000000000000000000001da56a4b0835bf800000"

// approveAndCall(address,uint256,bytes)
const approveAndCallData = "0xcae9ca51000000000000000000000000c4a11aaf6ea915ed7ac194161d2fc9384f15bff20000000000000000000000000000000000000000000001da56a4b0835bf800000000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000004000000000000000000000000056e465f654393fa48f007ed7346105c7195cee4300000000000000000000000042ccf0769e87cb2952634f607df1c7d62e0bbc52"

  const sender = new Address(hexToBytes('0xEA7c74D8286D256FA5D3B51D941608ff166538b9'))


  await setupEVMFromCalldata(evm, tonAddr, hexToBytes(tonContractCode), TON_STORAGE_LAYOUT, transferCalldata, sender)
  await setupEVMFromCalldata(evm, tonAddr, hexToBytes(tonContractCode), TON_STORAGE_LAYOUT, approveCalldata, sender)

  //  await evm.stateManager.putAccount(wtonAddr, new Account());
  //   await evm.stateManager.putCode(wtonAddr, hexToBytes(wtonContractCode));

  // await setupEVMFromCalldata(evm, wtonAddr, hexToBytes(wtonContractCode), WTON_STORAGE_LAYOUT, transferCalldata, sender)
  // await setupEVMFromCalldata(evm, wtonAddr, hexToBytes(wtonContractCode), WTON_STORAGE_LAYOUT, approveCalldata, sender)

  
  // ERC165 interface support setup
const INTERFACE_ID_ERC165 = '0x01ffc9a7';
const INTERFACE_ID_ON_APPROVE = '0x4a393149';


// Initialize WTON contract
await evm.stateManager.putAccount(wtonAddr, new Account());
await evm.stateManager.putCode(wtonAddr, hexToBytes(wtonContractCode));

// Set up storage for interface support
const SUPPORTED_INTERFACES_SLOT = '9';

// First, hash the slot number to get the base position of the mapping
const mappingSlot = keccak256(
    hexToBytes('0x' + SUPPORTED_INTERFACES_SLOT.padStart(64, '0'))
);

// Then hash each key with the mapping slot
const erc165Key = keccak256(
    hexToBytes(
        '0x' + INTERFACE_ID_ERC165.slice(2).padStart(64, '0') + 
        Buffer.from(mappingSlot).toString('hex')
    )
);

const onApproveKey = keccak256(
    hexToBytes(
        '0x' + INTERFACE_ID_ON_APPROVE.slice(2).padStart(64, '0') + 
        Buffer.from(mappingSlot).toString('hex')
    )
);

// Set interface support to true for WTON contract
await evm.stateManager.putStorage(
    wtonAddr,
    erc165Key,
    hexToBytes('0x0000000000000000000000000000000000000000000000000000000000000001')
);

await evm.stateManager.putStorage(
    wtonAddr,
    onApproveKey,
    hexToBytes('0x0000000000000000000000000000000000000000000000000000000000000001')
);

// First test ERC165 interface support
const supportsERC165Calldata = '0x01ffc9a7' + INTERFACE_ID_ERC165.slice(2).padStart(64, '0');

const erc165Result = await evm.runCall({
    caller: sender,
    to: wtonAddr,
    code: hexToBytes(wtonContractCode),
    data: hexToBytes(supportsERC165Calldata),
});

console.log('OnApprove supportsInterface result:', erc165Result);


// Then test OnApprove interface support
const supportsOnApproveCalldata = '0x01ffc9a7' + INTERFACE_ID_ON_APPROVE.slice(2).padStart(64, '0');

const onApproveResult = await evm.runCode({
    caller: sender,
    to: wtonAddr,
    code: hexToBytes(wtonContractCode),
    data: hexToBytes(supportsOnApproveCalldata),
});

console.log('OnApprove supportsInterface result:', Buffer.from(onApproveResult.returnValue).toString('hex'));

// Print storage values for comparison
const erc165Support = await evm.stateManager.getStorage(wtonAddr, erc165Key);
const onApproveSupport = await evm.stateManager.getStorage(wtonAddr, onApproveKey);

console.log('ERC165 storage:', Buffer.from(erc165Support).toString('hex'));
console.log('OnApprove storage:', Buffer.from(onApproveSupport).toString('hex'));

  // approveAndCall 실행
  const result = await evm.runCode({
    caller: sender,
    to: tonAddr,
    code: hexToBytes(tonContractCode),
    data: hexToBytes(approveAndCallData),
  })

  // 실행 결과 확인
  console.log("\n=== Execution Result ===")
  console.log('Exception:', result.exceptionError)
  
  if (result.exceptionError) {
    // console.log('evm:', result)
    console.log("evm return value:", Buffer.from(result.returnValue).toString())
  }

  // 실행 후 잔액 확인
  // console.log("\n=== After approveAndCall ===")
  // const tonBalanceAfter = await evm.stateManager.getStorage(tonAddr, tonBalanceKey)
  // const wtonBalanceAfter = await evm.stateManager.getStorage(wtonAddr, wtonBalanceKey)
  // console.log("TON balance after:", Buffer.from(tonBalanceAfter).toString('hex'))
  // console.log("WTON balance after:", Buffer.from(wtonBalanceAfter).toString('hex'))

  // Generate proof
  const permutation = await finalize(result.runState!.synthesizer.placements, undefined, true)

}

void main().catch(console.error)
