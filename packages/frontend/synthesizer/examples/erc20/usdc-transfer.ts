/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx erc20-transfer.ts
 */

import { Account, Address, hexToBytes } from "@synthesizer-libs/util"
import { keccak256 } from 'ethereum-cryptography/keccak'

import { createEVM } from '../../src/constructors.js'
import { finalize } from '../../src/tokamak/core/finalize.js'
import USDC_PROXY_CONTRACT from '../../src/constants/bytecodes/USDC_PROXY.json' assert { type: "json" };
import USDC_STORAGE_LAYOUT from '../../src/constants/storage-layouts/USDC_PROXY.json' assert { type: "json" };
import USDC_STORAGE_LAYOUT_V1 from '../../src/constants/storage-layouts/USDC_IMP.json' assert { type: "json" };
import USDC_STORAGE_LAYOUT_V2 from '../../src/constants/storage-layouts/USDC_IMP_2.json' assert { type: "json" };
import USDC_IMPLEMENTATION_V1 from '../../src/constants/bytecodes/USDC_IMP.json' assert { type: "json" };
import USDC_IMPLEMENTATION_V2 from '../../src/constants/bytecodes/USDC_IMP_2.json' assert { type: "json" };
import { setupUSDCFromCalldata } from "src/tokamak/utils/usdcEvmSetup.js";
// USDC contract bytecode
const contractCode = USDC_PROXY_CONTRACT.bytecode

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
        hexToBytes(contractCode),
        hexToBytes(USDC_IMPLEMENTATION_V1.bytecode),
        hexToBytes(USDC_IMPLEMENTATION_V2.bytecode),
        USDC_STORAGE_LAYOUT,
        USDC_STORAGE_LAYOUT_V1,
        USDC_STORAGE_LAYOUT_V2,
        calldata,
        sender
   )
  

  // Now run the transfer
  const result = await evm.runCode({
    caller: sender,
    to: proxyAddr,
    code: hexToBytes(contractCode),
    data: hexToBytes(
     calldata
    ),
  })

  console.log("\n=== After Transfer ===");
const balanceSlot = '9';  
  const senderBalanceKey = keccak256(
    hexToBytes(
        '0x' + sender.toString().slice(2).padStart(64, '0') + 
        balanceSlot.padStart(64, '0')
    )
);

  const balanceAfter = await evm.stateManager.getStorage(proxyAddr, senderBalanceKey);
console.log("Sender balance after:", Buffer.from(balanceAfter).toString('hex'));

  

  // Generate proof
  const permutation = await finalize(result.runState!.synthesizer.placements, undefined, true)
  console.log('')
}

void main().catch(console.error)
