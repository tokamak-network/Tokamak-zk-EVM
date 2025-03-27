/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx test-synthesizer-adapter.ts
 */

import { SynthesizerAdapter } from "../../src/adapters/synthesizerAdapter"
import { RETURN_PLACEMENT_INDEX } from "../../src/tokamak/constant/constants";

const main = async () => {
    // 첫 번째 실행
    console.log("=== First Transaction ===");
    const adapter1 = new SynthesizerAdapter();

    // Setup accounts
    const contractAddr1 = "0x2be5e8c109e2197D077D13A82dAead6a9b3433C5"
    const calldata1 = "0xa9059cbb000000000000000000000000d0ff1f431f55cd48f0ff469c579a1cceb45c7f1a0000000000000000000000000000000000000000000000acdc37d63ccd9ce18e"
    const sender1 = "0xF29f568F971C043Df7079A3121e9DE616b8998a3"

    // Process transaction through SynthesizerAdapter
    const { evm: evm1, executionResult: executionResult1, permutation: permutation1, placementInstance: placementInstance1 } = await adapter1.parseTransaction({
        contractAddr: contractAddr1,
        calldata: calldata1,
        sender: sender1
    });

    // Verify that permutation and placement instances were generated correctly
    // console.log("Permutation generated:", permutation1)
    // console.log("Placement instances generated:", placementInstance1)
    // console.log('executionResult:', executionResult1);

    if (executionResult1 && executionResult1.runState) {
        //log test
        const placementsMap1 = executionResult1.runState.synthesizer.placements;
        // Get placement indices from the adapter instead of using hardcoded values
        const { storageIn, return: returnIndex, storageOut } = adapter1.placementIndices;
        const storageLoadPlacement1 = placementsMap1.get(storageIn);
    
    const storageStorePlacement1 = placementsMap1.get(storageOut);

         const storageLoad1 = storageLoadPlacement1?.inPts || [];
    const storageStore1 = storageStorePlacement1?.outPts || [];
        const logsPlacement1 = placementsMap1.get(returnIndex);
        const _logsData1 = logsPlacement1?.outPts || [];

        console.log("evm.synthesizer.logPt : ", evm1.synthesizer.logPt)
        console.log('Raw data counts:', {
            storageLoad: storageLoad1.length,
            storageStoreCount: storageStore1.length,
            logsDataCount: _logsData1.length
        });
    }
    
    // 두 번째 실행
    console.log("\n=== Second Transaction ===");
    const adapter2 = new SynthesizerAdapter();

    // Setup accounts
    const contractAddr2 = "0x2be5e8c109e2197D077D13A82dAead6a9b3433C5"
    const calldata2 = "0xa9059cbb0000000000000000000000000ce8f6c9d4ad12e56e54018313761487d2d1fee900000000000000000000000000000000000000000000006c6b935b8bbd400000"
    const sender2 = "0xc2C30E79392A2D1a05288B172f205541a56FC20d"

    // Process transaction through SynthesizerAdapter
    const { evm: evm2, executionResult: executionResult2, permutation: permutation2, placementInstance: placementInstance2 } = await adapter2.parseTransaction({
        contractAddr: contractAddr2,
        calldata: calldata2,
        sender: sender2
    });

    if (executionResult2 && executionResult2.runState) {
        //log test
        const placementsMap2 = executionResult2.runState.synthesizer.placements;
        // Get placement indices from the adapter instead of using hardcoded values
        const { storageIn, return: returnIndex, storageOut } = adapter2.placementIndices;

          const storageLoadPlacement2 = placementsMap2.get(storageIn);
    
    const storageStorePlacement2 = placementsMap2.get(storageOut);

         const storageLoad2 = storageLoadPlacement2?.inPts || [];
    const storageStore2 = storageStorePlacement2?.outPts || [];

        const logsPlacement2 = placementsMap2.get(returnIndex);
        const _logsData2 = logsPlacement2?.outPts || [];

        console.log("logsPlacement2?.outPts : ", logsPlacement2?.outPts)


        // console.log("evm.synthesizer.logPt : ", evm2.synthesizer.logPt)
        // console.log("_logsData2 : ", _logsData2)

        console.log('Raw data counts:', {
              storageLoad: storageLoad2.length,
            storageStoreCount: storageStore2.length,
            logsDataCount: _logsData2.length
        });
    }
       
}

void main()