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

const tonContractCode = TON_CONTRACT.bytecode
const wtonContractCode = WTON_CONTRACT.bytecode

 // 문자열을 hex로 변환하는 함수
function stringToHex(str: string): string {
  return '0x' + Buffer.from(str).toString('hex').padStart(64, '0');
}

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

   await evm.stateManager.putAccount(wtonAddr, new Account());
    await evm.stateManager.putCode(wtonAddr, hexToBytes(wtonContractCode));

  // await setupEVMFromCalldata(evm, wtonAddr, hexToBytes(wtonContractCode), WTON_STORAGE_LAYOUT, transferCalldata, sender)
  // await setupEVMFromCalldata(evm, wtonAddr, hexToBytes(wtonContractCode), WTON_STORAGE_LAYOUT, approveCalldata, sender)

  
  // ERC165 interface support setup
// const INTERFACE_ID_ERC165 = '0x01ffc9a7';
// const INTERFACE_ID_ON_APPROVE = '0x4a393149';


// Initialize WTON contract
// await evm.stateManager.putAccount(wtonAddr, new Account());
//   await evm.stateManager.putCode(wtonAddr, hexToBytes(wtonContractCode));
 

 

// // 스토리지 수동 초기화
// const storageValues = {
//   name: "Wrapped TON",
//   symbol: "WTON",
//   decimals: "27",
//   ton: tonAddr.toString()
// };

// // 스토리지 설정
// await evm.stateManager.putStorage(
//   wtonAddr,
//   hexToBytes("0x0000000000000000000000000000000000000000000000000000000000000006"), // name slot
//   hexToBytes(stringToHex("Wrapped TON"))
// );

// await evm.stateManager.putStorage(
//   wtonAddr,
//   hexToBytes("0x0000000000000000000000000000000000000000000000000000000000000005"), // symbol slot
//   hexToBytes(stringToHex("WTON"))
// );

// await evm.stateManager.putStorage(
//   wtonAddr,
//   hexToBytes("0x0000000000000000000000000000000000000000000000000000000000000002"), // decimals slot
//   hexToBytes('0x' + '1b'.padStart(64, '0')) // 27 in hex
// );

// // TON 주소 설정
// await evm.stateManager.putStorage(
//   wtonAddr,
//   hexToBytes("0x0000000000000000000000000000000000000000000000000000000000000001"), // TON address slot (확인 필요)
//   hexToBytes('0x' + tonAddr.toString().slice(2).padStart(64, '0'))
// );

//   // onApprove 인터페이스 ID: 0x4a393149
// await evm.stateManager.putStorage(
//   wtonAddr,
//   hexToBytes("0x0000000000000000000000000000000000000000000000000000000000000004"),
//   hexToBytes("0x" + "4a393149".padStart(64, '0'))
// );

// // 또는 mapping으로 설정하는 경우:
// const INTERFACE_ID_ON_APPROVE = '0x4a393149';
// const SUPPORTED_INTERFACES_SLOT = '0x04';

// // mapping의 키를 계산
// const mappingKey = keccak256(
//   hexToBytes(
//     "0x" + INTERFACE_ID_ON_APPROVE.slice(2).padStart(64, '0') + 
//     SUPPORTED_INTERFACES_SLOT.slice(2).padStart(64, '0')
//   )
// );

// // mapping에 true 값 설정 (1)
// await evm.stateManager.putStorage(
//   wtonAddr,
//   mappingKey,
//   hexToBytes("0x" + "1".padStart(64, '0'))  
  // );
  
  // 스토리지 설정
// Slot 0: bool/uint8 값 1
await evm.stateManager.putStorage(
  wtonAddr,
  hexToBytes("0x0000000000000000000000000000000000000000000000000000000000000000"),
  hexToBytes("0x" + "1".padStart(64, '0'))
);

// Slot 3: uint128 값
await evm.stateManager.putStorage(
  wtonAddr,
  hexToBytes("0x0000000000000000000000000000000000000000000000000000000000000003"),
  hexToBytes("0x" + "41632775533584369980774943213748224".toString(16).padStart(64, '0'))
);

// Slot 5: address
await evm.stateManager.putStorage(
  wtonAddr,
  hexToBytes("0x0000000000000000000000000000000000000000000000000000000000000005"),
  hexToBytes("0x" + "dd9f0ccc044b0781289ee318e5971b0139602c26".padStart(64, '0'))
);

// Slot 6: name (Wrapped TON)
await evm.stateManager.putStorage(
  wtonAddr,
  hexToBytes("0x0000000000000000000000000000000000000000000000000000000000000006"),
  hexToBytes(stringToHex("Wrapped TON"))
);

// Slot 7: symbol (WTON)
await evm.stateManager.putStorage(
  wtonAddr,
  hexToBytes("0x0000000000000000000000000000000000000000000000000000000000000007"),
  hexToBytes(stringToHex("WTON"))
);

// Slot 8: uint256 값
await evm.stateManager.putStorage(
  wtonAddr,
  hexToBytes("0x0000000000000000000000000000000000000000000000000000000000000008"),
  hexToBytes("0x" + "165202277148218551859080237684555207204770035007488".toString(16).padStart(64, '0'))
);
  
  // 슬롯 4를 0으로 초기화 (mapping base)
await evm.stateManager.putStorage(
  wtonAddr,
  hexToBytes("0x0000000000000000000000000000000000000000000000000000000000000004"),
  hexToBytes("0x" + "0".padStart(64, '0'))
);

// mapping에 onApprove 지원 설정
const mappingKey = keccak256(
  hexToBytes(
    "0x" + "4a393149".padStart(64, '0') + 
    "0000000000000000000000000000000000000000000000000000000000000004"
  )
);

await evm.stateManager.putStorage(
  wtonAddr,
  mappingKey,
  hexToBytes("0x" + "1".padStart(64, '0'))
);
  
//   // onApprove 인터페이스 ID: 0x4a393149
// await evm.stateManager.putStorage(
//   wtonAddr,
//   hexToBytes("0x0000000000000000000000000000000000000000000000000000000000000004"),
//   hexToBytes("0x" + "4a393149".padStart(64, '0'))
// );

// ERC165 interface support setup
const INTERFACE_ID_ERC165 = '0x01ffc9a7';
const INTERFACE_ID_ON_APPROVE = '0x4a393149';

// // mapping의 키를 계산 (keccak256(interfaceId . slot))
// const mappingKey = keccak256(
//   hexToBytes(
//     "0x" + INTERFACE_ID_ON_APPROVE.slice(2).padStart(64, '0') + 
//     "0000000000000000000000000000000000000000000000000000000000000004"
//   )
// );

// // mapping에 true 값 설정 (1)
// await evm.stateManager.putStorage(
//   wtonAddr,
//   mappingKey,
//   hexToBytes("0x" + "1".padStart(64, '0'))  
// );
  
//   // mapping에 true 값 설정 (1)
// await evm.stateManager.putStorage(
//   wtonAddr,
//   mappingKey,
//   hexToBytes("0x" + "1".padStart(64, '0'))  
// );

// // ERC165도 지원하도록 설정
const erc165MappingKey = keccak256(
  hexToBytes(
    "0x" + INTERFACE_ID_ERC165.slice(2).padStart(64, '0') + 
    "0000000000000000000000000000000000000000000000000000000000000004"
  )
);

// await evm.stateManager.putStorage(
//   wtonAddr,
//   erc165MappingKey,
//   hexToBytes("0x" + "1".padStart(64, '0'))
// );


// 스토리지 확인
console.log("OnApprove mapping key:", mappingKey.toString('hex'));
const onApproveSupport = await evm.stateManager.getStorage(wtonAddr, mappingKey);
console.log("OnApprove support value:", Buffer.from(onApproveSupport).toString('hex'));

console.log("ERC165 mapping key:", erc165MappingKey.toString('hex'));
const erc165Support = await evm.stateManager.getStorage(wtonAddr, erc165MappingKey);
console.log("ERC165 support value:", Buffer.from(erc165Support).toString('hex'));

  // WTON contract의 supportsInterface 매핑 설정
const interfaceId = "0x4a393149";  // onApprove interface id

const _mappingKey = keccak256(
  hexToBytes(
    "0x" + interfaceId.slice(2).padStart(64, '0') + 
    "0000000000000000000000000000000000000000000000000000000000000004"
  )
);

 
  
  // 2. onApprove interface ID (0x4a393149) 지원 설정
const onApproveMappingKey = keccak256(
  hexToBytes(
    "0x" + "4a393149".padStart(64, '0') + 
    "0000000000000000000000000000000000000000000000000000000000000004"
  )
);
  
   console.log("Current storage at mapping key:", await evm.stateManager.getStorage(wtonAddr, _mappingKey));

await evm.stateManager.putStorage(
  wtonAddr,
  onApproveMappingKey,
  hexToBytes("0x" + "1".padStart(64, '0'))
);

// 매핑 값을 1로 설정
await evm.stateManager.putStorage(
  wtonAddr,
  mappingKey,
  hexToBytes("0x" + "1".padStart(64, '0'))
);
  
  // 슬롯 4를 0으로 초기화 (mapping base)
await evm.stateManager.putStorage(
  wtonAddr,
  hexToBytes("0x0000000000000000000000000000000000000000000000000000000000000004"),
  hexToBytes("0x" + "0".padStart(64, '0'))
);

// 1. ERC165 interface ID (0x01ffc9a7) 지원 설정
// const erc165MappingKey = keccak256(
//   hexToBytes(
//     "0x" + "01ffc9a7".padStart(64, '0') + 
//     "0000000000000000000000000000000000000000000000000000000000000004"
//   )
// );

await evm.stateManager.putStorage(
  wtonAddr,
  erc165MappingKey,
  hexToBytes("0x" + "1".padStart(64, '0'))
);

// 2. onApprove interface ID (0x4a393149) 지원 설정
// const onApproveMappingKey = keccak256(
//   hexToBytes(
//     "0x" + "4a393149".padStart(64, '0') + 
//     "0000000000000000000000000000000000000000000000000000000000000004"
//   )
// );

await evm.stateManager.putStorage(
  wtonAddr,
  onApproveMappingKey,
  hexToBytes("0x" + "1".padStart(64, '0'))
);

// 설정 확인
console.log("ERC165 support:", await evm.stateManager.getStorage(wtonAddr, erc165MappingKey));
console.log("OnApprove support:", await evm.stateManager.getStorage(wtonAddr, onApproveMappingKey));
  
  // 0번부터 9번까지 스토리지 슬롯 확인
for (let i = 0; i <= 9; i++) {
    const slot = "0x" + i.toString().padStart(64, '0');
    const value = await evm.stateManager.getStorage(wtonAddr, hexToBytes(slot));
    console.log(`Slot ${i}:`, Buffer.from(value).toString('hex'));
}

// 16진수로도 출력
  for (let i = 0; i <= 9; i++) {
    const slot = "0x" + i.toString().padStart(64, '0');
    const value = await evm.stateManager.getStorage(wtonAddr, hexToBytes(slot));
    console.log(`Slot ${i} (hex):`, '0x' + Buffer.from(value).toString('hex'));

  }

  // approveAndCall 실행
  const result = await evm.runCode({
    caller: sender,
    to: tonAddr,
    code: hexToBytes(tonContractCode),
    data: hexToBytes(approveAndCallData),
  })

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
  // const permutation = await finalize(result.runState!.synthesizer.placements, undefined, true)

}

void main().catch(console.error)
