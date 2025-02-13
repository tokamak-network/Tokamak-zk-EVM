/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx usdc-approve.ts
 */

import {  Address, hexToBytes } from "@ethereumjs/util"
import { keccak256 } from 'ethereum-cryptography/keccak'

import { createEVM } from '../../src/constructors.js'
import { finalize } from '../../src/tokamak/core/finalize.js'
import ERC20_CONTRACTS from '../../constants/bytecodes/ERC20_CONTRACTS.json' assert { type: "json" };
import USDC_STORAGE_LAYOUT from '../../constants/storage-layouts/USDC_PROXY.json' assert { type: "json" };
import USDC_STORAGE_LAYOUT_V1 from '../../constants/storage-layouts/USDC_IMP.json' assert { type: "json" };
import USDC_STORAGE_LAYOUT_V2 from '../../constants/storage-layouts/USDC_IMP_2.json' assert { type: "json" };
import { setupUSDCFromCalldata } from "src/tokamak/utils/usdcSetup.js";
import USDC_IMPLEMENTATION_V1 from '../../constants/bytecodes/USDC_IMP.json' assert { type: "json" };
import USDC_IMPLEMENTATION_V2 from '../../constants/bytecodes/USDC_IMP_2.json' assert { type: "json" };

const main = async () => {
    const evm = await createEVM()

    // 컨트랙트 주소들 설정
    const proxyAddr = new Address(hexToBytes('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')) // USDC 프록시
    const implementationV1Addr = new Address(hexToBytes('0x43506849d7c04f9138d1a2050bbf3a0c054402dd')) // v1
    const implementationV2Addr = new Address(hexToBytes('0x800c32eaa2a6c93cf4cb51794450ed77fbfbb172')) // v2

    /**
     * approve 함수 호출 데이터 생성
     * function approve(address spender, uint256 amount)
     */
    const spender = '0xBC8552339dA68EB65C8b88B414B5854E0E366cFc'
    const amount = '1000000000' // 1000 USDC (6 decimals)
    const calldata = '0x095ea7b3' + 
                    spender.slice(2).padStart(64, '0') +
                    BigInt(amount).toString(16).padStart(64, '0')

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

    // 실행 전 allowance 확인
    const allowanceSlot = '10';  // USDC allowance slot
    const ownerKey = keccak256(
        hexToBytes(
            '0x' + sender.toString().slice(2).padStart(64, '0') + 
            allowanceSlot.padStart(64, '0')
        )
    );
    const spenderKey = keccak256(
        hexToBytes(
            '0x' + spender.slice(2).padStart(64, '0') + 
            ownerKey.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '').padStart(64, '0')
        )
    );

    console.log("\n=== Before Approve ===");
    const allowanceBefore = await evm.stateManager.getStorage(proxyAddr, spenderKey);
    const allowanceBeforeDecimal = BigInt('0x' + Buffer.from(allowanceBefore).toString('hex'));
    console.log("Spender allowance before:", allowanceBeforeDecimal.toString());

    // Execute approve
    const result = await evm.runCode({
        caller: sender,
        to: proxyAddr,
        code: hexToBytes(ERC20_CONTRACTS.USDC_PROXY),
        data: hexToBytes(calldata),
    })

    console.log("result", result)

    // 실행 후 allowance 확인
    console.log("\n=== After Approve ===");
    const allowanceAfter = await evm.stateManager.getStorage(proxyAddr, spenderKey);
    const allowanceAfterDecimal = BigInt('0x' + Buffer.from(allowanceAfter).toString('hex'));
    console.log("Spender allowance after:", allowanceAfterDecimal.toString());

    // Generate proof
    const permutation = await finalize(result.runState!.synthesizer.placements, undefined, true)
}

void main().catch(console.error)