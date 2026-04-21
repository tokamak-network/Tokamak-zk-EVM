import { StateSnapshot, TxSnapshot } from 'tokamak-l2js';
import { synthesizeFromSnapshotInput } from '../../../core/src/app.ts';
import type { BlockInfo } from '../../../core/src/synthesizer.ts';
import { writeSynthesisOutputJson } from '../io/jsonWriter.ts';
import { installedSubcircuitLibrary } from '../subcircuit/installedLibrary.ts';
import { loadSubcircuitWasm } from '../subcircuit/wasmLoader.ts';
import { readJson } from './utils/node.ts';

export interface TokamakChannelTxFiles {
  previousState: string;
  transaction: string;
  blockInfo: string;
  contractCode: string;
}

export async function runTokamakChannelTxFromFiles(
  files: TokamakChannelTxFiles,
  outputDir?: string,
): Promise<void> {
  console.log('🔄 Executing L2 State Channel Transfer...');
  console.log('');

  const previousState = readJson<StateSnapshot>(files.previousState);
  const previousStateRoots = previousState.stateRoots;
  console.log(`   ✅ Previous state roots: ${previousStateRoots.join(', ')}`);

  const transactionSnapshot = readJson<TxSnapshot>(files.transaction);
  const contractCodes = readJson<{ address: string; code: string }[]>(files.contractCode);
  const blockInfo = readJson<BlockInfo>(files.blockInfo);

  console.log('[SynthesizerAdapter] Generating circuit outputs...');
  const output = await synthesizeFromSnapshotInput({
    previousState,
    transaction: transactionSnapshot,
    blockInfo,
    contractCodes,
    subcircuitLibrary: installedSubcircuitLibrary,
    wasmBuffers: loadSubcircuitWasm(),
  });

  writeSynthesisOutputJson(output, outputDir);
  console.log('[SynthesizerAdapter] ✅ Outputs written');
}
