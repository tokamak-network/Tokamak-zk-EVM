import { SynthesizerAdapter } from "../../dist/esm/adapters/synthesizerAdapter.js"

const main = async () => {
    try {
        console.log("Creating adapter...");
        const adapter = new SynthesizerAdapter();
        console.log("Adapter created successfully");

        // Setup accounts
        const contractAddr = "0x2be5e8c109e2197D077D13A82dAead6a9b3433C5"
        const calldata = "0xa9059cbb0000000000000000000000000ce8f6c9d4ad12e56e54018313761487d2d1fee900000000000000000000000000000000000000000000006c6b935b8bbd400000"
        const sender = "0xc2C30E79392A2D1a05288B172f205541a56FC20d"

        console.log("Calling parseTransaction...");
        const { evm, executionResult, permutation, placementInstance } = await adapter.parseTransaction({
            contractAddr,
            calldata,
            sender
        });
        console.log("parseTransaction completed");

        console.log("Result:", executionResult);
    } catch (error) {
        console.error("Error occurred:", error);
        // 스택 트레이스 출력
        if (error instanceof Error) {
            console.error(error.stack);
        }
    }
}

void main()