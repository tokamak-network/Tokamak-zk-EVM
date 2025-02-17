/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx test-synthesizer-adapter.ts
 */

import { SynthesizerAdapter } from "../../src/adapters/synthesizerAdapter"

const main = async () => {
    const adapter = new SynthesizerAdapter();

    // Setup accounts
    const contractAddr = "0x2be5e8c109e2197D077D13A82dAead6a9b3433C5"
    const calldata = "0xa9059cbb0000000000000000000000000ce8f6c9d4ad12e56e54018313761487d2d1fee900000000000000000000000000000000000000000000006c6b935b8bbd400000"
    const sender = "0xc2C30E79392A2D1a05288B172f205541a56FC20d"

    // Process transaction through SynthesizerAdapter
    const { evm, executionResult, permutation, placementInstance } = await adapter.parseTransaction({
        contractAddr,
        calldata,
        sender
    });

    // Verify that permutation and placement instances were generated correctly
    console.log("Permutation generated:", permutation)
    console.log("Placement instances generated:", placementInstance)
    console.log('executionResult:', executionResult)
}

void main()