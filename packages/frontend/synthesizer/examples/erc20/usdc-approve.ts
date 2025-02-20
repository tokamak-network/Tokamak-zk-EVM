/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx usdc-approve.ts
 */

import {  Address, hexToBytes } from "@ethereumjs/util"
import { keccak256 } from 'ethereum-cryptography/keccak'

import { createEVM } from '../../src/constructors.js'
import { finalize } from '../../src/tokamak/core/finalize.js'
import USDC_PROXY_CONTRACT from '../../constants/bytecodes/USDC_PROXY.json' assert { type: "json" };
import USDC_STORAGE_LAYOUT from '../../constants/storage-layouts/USDC_PROXY.json' assert { type: "json" };
import USDC_STORAGE_LAYOUT_V1 from '../../constants/storage-layouts/USDC_IMP.json' assert { type: "json" };
import USDC_STORAGE_LAYOUT_V2 from '../../constants/storage-layouts/USDC_IMP_2.json' assert { type: "json" };
import { setupUSDCFromCalldata } from "src/tokamak/utils/usdcEvmSetup.js";
import USDC_IMPLEMENTATION_V1 from '../../constants/bytecodes/USDC_IMP.json' assert { type: "json" };
import USDC_IMPLEMENTATION_V2 from '../../constants/bytecodes/USDC_IMP_2.json' assert { type: "json" };

const parseApprovalEvent = (logs: any[]) => {
    // Approval 이벤트: event Approval(address indexed owner, address indexed spender, uint256 value)
    for (const log of logs) {
        try {
            // log[0]은 컨트랙트 주소
            // log[1]은 topics 배열
            // log[2]는 data
            const [contractAddress, topics, data] = log;
            
            // topics[0]는 이벤트 시그니처 해시
            // Approval(address,address,uint256) => 0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925
            const eventSignature = Buffer.from(topics[0]).toString('hex');
            if (eventSignature === '8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925') {
                const owner = '0x' + Buffer.from(topics[1]).toString('hex');
                const spender = '0x' + Buffer.from(topics[2]).toString('hex');
                const value = BigInt('0x' + Buffer.from(data).toString('hex'));
                
                return {
                    contractAddress: '0x' + Buffer.from(contractAddress).toString('hex'),
                    event: 'Approval',
                    owner,
                    spender,
                    value: value.toString()
                };
            }
        } catch (error) {
            console.error("Error parsing log:", error);
            console.log("Problematic log:", log);
        }
    }
    return null;
}

// USDC contract bytecode
const contractCode = USDC_PROXY_CONTRACT.bytecode


const main = async () => {
    const evm = await createEVM();

    // 컨트랙트 주소들 설정
    const proxyAddr = new Address(hexToBytes('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')) // USDC 프록시
    const implementationV1Addr = new Address(hexToBytes('0x43506849d7c04f9138d1a2050bbf3a0c054402dd')) // v1
    const implementationV2Addr = new Address(hexToBytes('0x800c32eaa2a6c93cf4cb51794450ed77fbfbb172')) // v2

    /**
     * https://etherscan.io/tx/0xd2e02df1a4e29d14a7ee34c475580d55a932ab5c2b81a7046743a776d449b6b4
     */
    const spender = '0x334841090107D86523bd7cc6DA8279dc02aAE9e9'
    const amount = '95192259' //(6 decimals)
    const calldata = '0x095ea7b30000000000000000000000001111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000005ac84c3'
    const sender = new Address(hexToBytes('0x334841090107D86523bd7cc6DA8279dc02aAE9e9'))

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

    // console.log("\n=== Before Approve ===");
    // const allowanceBefore = await evm.stateManager.getStorage(proxyAddr, spenderKey);
    // const allowanceBeforeDecimal = BigInt('0x' + Buffer.from(allowanceBefore).toString('hex'));
    // console.log("Spender allowance before:", allowanceBeforeDecimal.toString());

    // Execute approve
    const result = await evm.runCode({
        caller: sender,
        to: proxyAddr,
        code: hexToBytes(contractCode),
        data: hexToBytes(calldata),
    })

    console.log("result", result)

    // 실행 후 allowance 확인
    // console.log("\n=== After Approve ===");
    // const allowanceAfter = await evm.stateManager.getStorage(proxyAddr, spenderKey);
    // const allowanceAfterDecimal = BigInt('0x' + Buffer.from(allowanceAfter).toString('hex'));
    // console.log("Spender allowance after:", allowanceAfterDecimal.toString());

      // 이벤트 파싱 추가
    if (result.logs && result.logs.length > 0) {
        const approvalEvent = parseApprovalEvent(result.logs);
        console.log("\n=== Parsed Approval Event ===");
        console.log(approvalEvent);
    }


    // Generate proof
    const permutation = await finalize(result.runState!.synthesizer.placements, undefined, true)
}

void main().catch(console.error)