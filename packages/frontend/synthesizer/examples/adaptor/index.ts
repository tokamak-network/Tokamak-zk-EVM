/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx index.ts <TRANSACTION_HASH> <RPC_URL>
 *
 * Example:
 * DEBUG=ethjs,evm:*,evm:*:* tsx packages/frontend/synthesizer/examples/adaptor/index.ts 0x04dbba13b0ef81a08a3aba9cee145dae19c4d6c09bcfacb22b8d4c385c6c3d77 <YOUR_RPC_URL>
 */

import { SynthesizerAdapter } from '../../src/adapters/synthesizerAdapter.js';

const main = async () => {
  const [, , RPC_URL, TRANSACTION_HASH] = process.argv;

  if (!TRANSACTION_HASH || !RPC_URL) {
    console.error('Usage: tsx index.ts <TRANSACTION_HASH> <RPC_URL>');
    process.exit(1);
  }

  console.log(`🔍 Processing transaction: ${TRANSACTION_HASH}`);
  console.log(`🌐 Using RPC: ${RPC_URL}`);

  try {
    // Create SynthesizerAdapter instance
    const adapter = new SynthesizerAdapter(RPC_URL, true); // true for mainnet

    // Get placement indices for reference
    const placementIndices = adapter.placementIndices;
    console.log('📊 Placement Indices:', placementIndices);

    // Parse transaction using the adapter
    const { evm, executionResult, permutation } =
      await adapter.parseTransactionByHash(TRANSACTION_HASH);

    console.log('✅ Transaction processed successfully!');
    console.log('📈 Execution Result:', {
      gasUsed: executionResult.executionGasUsed?.toString(),
      exceptionError: executionResult.exceptionError,
      returnValue: executionResult.returnValue
        ? Buffer.from(executionResult.returnValue).toString('hex')
        : undefined,
    });

    console.log('🔄 Permutation:', {
      permutationY: permutation.permutationY,
      permutationX: permutation.permutationX,
      permutationFile: permutation.permutationFile,
      placementVariables: permutation.placementVariables,
    });

    // Access synthesizer state for additional data
    const synthesizerState = evm.synthesizer?.state;
    if (synthesizerState) {
      console.log('🏗️  Synthesizer State:', {
        placementsCount: synthesizerState.placements.size,
        logPtCount: synthesizerState.logPt?.length || 0,
      });

      // Show sample placement data
      const samplePlacement = Array.from(
        synthesizerState.placements.values(),
      )[0];
      if (samplePlacement) {
        console.log('📋 Sample Placement:', {
          name: samplePlacement.name,
          usage: samplePlacement.usage,
          inPtsCount: samplePlacement.inPts.length,
          outPtsCount: samplePlacement.outPts.length,
        });
      }
    }

    return { evm, executionResult, permutation };
  } catch (error) {
    console.error('❌ Error processing transaction:', error);
    process.exit(1);
  }
};

void main().catch((err) => {
  console.error(err);
  console.error(`❌ Failed to process transaction.`);
  process.exit(1);
});
