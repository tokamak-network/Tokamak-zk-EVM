import { RunTxResult } from "@ethereumjs/vm";

export function synthesizeResultAnalyzer( runTxResult: RunTxResult) {
    // Check transaction execution result
    const executionSuccess = !runTxResult.execResult.exceptionError;
    const gasUsed = runTxResult.totalGasSpent;
    const logsCount = runTxResult.execResult.logs?.length || 0;
    const errorMessage = runTxResult.execResult.exceptionError
        ? runTxResult.execResult.exceptionError.error
        : undefined;

    console.log('[SynthesizerAdapter] Transaction execution result:');
    console.log(`  - Success: ${executionSuccess}`);
    console.log(`  - Gas Used: ${gasUsed}`);
    console.log(`  - Logs: ${logsCount}`);
    if (!executionSuccess && errorMessage) {
        console.log(`  - Error: ${errorMessage}`);
    }

    if (!executionSuccess) {
        console.error('\n❌ [SynthesizerAdapter] Transaction REVERTED!');
        console.error('   This may indicate:');
        console.error('   - Insufficient balance for transfer');
        console.error('   - Invalid function call');
        console.error('   - Contract logic error');
        if (errorMessage) {
            console.error(`   - Error message: ${errorMessage}`);
        }
        throw new Error(`Transaction execution failed: ${errorMessage || 'Transaction reverted'}`);
    }
}
