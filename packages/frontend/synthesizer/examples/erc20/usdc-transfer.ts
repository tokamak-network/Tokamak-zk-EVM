/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx erc20-transfer.ts
 */

import { Account, Address, hexToBytes } from "@ethereumjs/util/index.js"
import { keccak256 } from 'ethereum-cryptography/keccak'

import { createEVM } from '../../src/constructors.js'
import { finalize } from '../../src/tokamak/core/finalize.js'
import ERC20_CONTRACTS from '../../constants/bytecodes/ERC20_CONTRACTS.json' assert { type: "json" };
import USDC_STORAGE_LAYOUT from '../../constants/storage-layouts/USDC_PROXY.json' assert { type: "json" };
import USDC_STORAGE_LAYOUT_V1 from '../../constants/storage-layouts/USDC_IMP.json' assert { type: "json" };
import USDC_STORAGE_LAYOUT_V2 from '../../constants/storage-layouts/USDC_IMP_2.json' assert { type: "json" };
import { setupEVMFromCalldata } from "src/tokamak/utils/evmSetup.js";
import USDC_IMPLEMENTATION_V1 from '../../constants/bytecodes/USDC_IMP.json' assert { type: "json" };
import USDC_IMPLEMENTATION_V2 from '../../constants/bytecodes/USDC_IMP_2.json' assert { type: "json" };
import { setupUSDCFromCalldata } from "src/tokamak/utils/usdcSetup.js";
// USDC contract bytecode
const contractCode = ERC20_CONTRACTS.USDC_PROXY

const main = async () => {
  const evm = await createEVM()

    // 컨트랙트 주소들 설정
  const proxyAddr = new Address(hexToBytes('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')) // USDC 프록시
  const implementationV1Addr = new Address(hexToBytes('0x43506849d7c04f9138d1a2050bbf3a0c054402dd')) // v1
  const implementationV2Addr = new Address(hexToBytes('0x800c32eaa2a6c93cf4cb51794450ed77fbfbb172')) // v2


  /**
   * 출처 : https://etherscan.io/tx/0xd1567b6d2a512d7910c3b231ea880e0451cfa3de7ff8377748f9fc396912f3f6
   */
  const calldata = "0xa9059cbb00000000000000000000000043b719b9c6cf849dca549765ba1af00f3dfc4ac10000000000000000000000000000000000000000000000000000000005f60810"
  const sender = new Address(hexToBytes('0x03ec765dbdF46AADaa52Cd663Fe0ea174be36720'))

   await setupUSDCFromCalldata(
        evm,
        proxyAddr,
        implementationV1Addr,
        implementationV2Addr,
        hexToBytes(ERC20_CONTRACTS.USDC_PROXY),
        hexToBytes(USDC_IMPLEMENTATION_V1.bytecode),
        hexToBytes(USDC_IMPLEMENTATION_V2.bytecode),
     USDC_STORAGE_LAYOUT,
     USDC_STORAGE_LAYOUT_V1,
     USDC_STORAGE_LAYOUT_V2,
        calldata,
        sender
   )
  
  
  
console.log("=== Testing Proxy Execution ===");
const proxyTest = await evm.runCode({
    caller: sender,
    to: proxyAddr,
    code: hexToBytes(contractCode),
    data: hexToBytes(calldata),
})
console.log("Proxy execution result:", proxyTest);

// 2. V1 implementation 직접 실행해보기
console.log("\n=== Testing V1 Implementation ===");
const v1Test = await evm.runCode({
    caller: sender,
    to: implementationV1Addr,
    code: hexToBytes(USDC_IMPLEMENTATION_V1.bytecode),
    data: hexToBytes(calldata),
})
console.log("V1 execution result:", v1Test);

// 3. V2 implementation 직접 실행해보기
console.log("\n=== Testing V2 Implementation ===");
const v2Test = await evm.runCode({
    caller: sender,
    to: implementationV2Addr,
    code: hexToBytes(USDC_IMPLEMENTATION_V2.bytecode),
    data: hexToBytes(calldata),
})
console.log("V2 execution result:", v2Test);
    

  // // Now run the transfer
  // const result = await evm.runCode({
  //   caller: sender,
  //   to: proxyAddr,
  //   code: hexToBytes(contractCode),
  //   data: hexToBytes(
  //    calldata
  //   ),
     
  // })

  // console.log("result", result.exceptionError)

  // Generate proof
  const permutation = await finalize(result.runState!.synthesizer.placements, undefined, true)
}

void main().catch(console.error)
