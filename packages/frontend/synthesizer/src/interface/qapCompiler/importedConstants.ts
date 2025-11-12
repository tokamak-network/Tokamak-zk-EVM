import { fileURLToPath } from 'node:url';
import { CircomConstMap, GlobalWireList, SetupParams, SubcircuitInfo } from './types.ts';
import { BASE_URL, createInfoByName, loadCircomConstants, readJson, structCheckForGlobalWireList, structCheckForSetupParams, structCheckForSubcircuitInfo } from './utils.ts'
import { BUFFER_LIST, ReservedBuffer, SubcircuitInfoByName, SubcircuitInfoByNameEntry } from './configuredTypes.ts';

// -----------------------------------------------------------------------------
// Load compiler JSONs concurrently (URL-based, platform-safe)
// -----------------------------------------------------------------------------
const [gRaw, sRaw, scRaw] = await Promise.all([
  readJson(new URL('subcircuits/library/globalWireList.json', BASE_URL)),
  readJson(new URL('subcircuits/library/setupParams.json', BASE_URL)),
  readJson(new URL('subcircuits/library/subcircuitInfo.json', BASE_URL)),
]);

// Validate and expose typed constants
structCheckForGlobalWireList(gRaw);
structCheckForSetupParams(sRaw);
structCheckForSubcircuitInfo(scRaw);

export const globalWireList: GlobalWireList = gRaw;
export const setupParams: SetupParams = sRaw;
export const subcircuitInfo: SubcircuitInfo = scRaw;
export const subcircuitInfoByName: SubcircuitInfoByName = createInfoByName(subcircuitInfo)

export const SUBCIRCUIT_BUFFER_MAPPING: Record<ReservedBuffer, SubcircuitInfoByNameEntry | undefined> = {
  PUBLIC_OUT: subcircuitInfoByName.get('bufferPubOut'),
  PUBLIC_IN: subcircuitInfoByName.get('bufferPubIn'),
  BLOCK_IN: subcircuitInfoByName.get('bufferBlockIn'),
  EVM_IN: subcircuitInfoByName.get('bufferEVMIn'),
  PRIVATE_IN: subcircuitInfoByName.get('bufferPrvIn'),
}

// Derived path for WASM artifacts (filesystem path)
export const wasmDir = fileURLToPath(new URL('subcircuits/library/wasm', BASE_URL));

// Input parameters to the QAP-compiler
const qapCompilerParams = await loadCircomConstants() as CircomConstMap
export const ACCUMULATOR_INPUT_LIMIT = qapCompilerParams.nAccumulation
// export const MAX_TX_NUMBER = qapCompilerParams.nTx
export const MT_DEPTH = qapCompilerParams.nMtDepth
export const POSEIDON_INPUTS = qapCompilerParams.nPoseidonInputs
export const MAX_MT_LEAVES = POSEIDON_INPUTS ** MT_DEPTH
export const NUMBER_OF_PREV_BLOCK_HASHES = qapCompilerParams.nPrevBlockHashes
export const JUBJUB_EXP_BATCH_SIZE = qapCompilerParams.nJubjubExpBatch

export const FIRST_ARITHMETIC_PLACEMENT_INDEX = BUFFER_LIST.length