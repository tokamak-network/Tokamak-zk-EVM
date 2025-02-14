/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx test-synthesizer-adapter.ts
 */

import { Address, hexToBytes } from "@ethereumjs/util/index.js"
import { SynthesizerAdapter } from "../../src/adapters/synthesizerAdapter.js"
import { logAfterTransaction } from "../utils/balanceUnit.js"
import { getStorageSlot } from "../utils/getStorageSlot.js"
import TON_STORAGE_LAYOUT from "../../constants/storage-layouts/TON.json" assert { type: "json" };

const main = async () => {
    const adapter = new SynthesizerAdapter();

    // 계정 설정
    const contractAddr = "0x2be5e8c109e2197D077D13A82dAead6a9b3433C5"
    const calldata = "0xa9059cbb0000000000000000000000000ce8f6c9d4ad12e56e54018313761487d2d1fee900000000000000000000000000000000000000000000006c6b935b8bbd400000"
    const sender = "0xc2C30E79392A2D1a05288B172f205541a56FC20d"

    // SynthesizerAdapter를 통해 트랜잭션 처리
    const { evm, executionResult, permutation, placementInstance } = await adapter.parseTransaction({
        contractAddr,
        calldata,
        sender
    });

    

    // permutation과 placementInstance가 제대로 생성되었는지 확인
    console.log("Permutation generated:", permutation)
    console.log("Placement instances generated:", placementInstance)
    console.log('executionResult :', executionResult)
}

void main()