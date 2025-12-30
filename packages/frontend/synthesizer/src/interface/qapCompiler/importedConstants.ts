import { FrontendConfig, GlobalWireList, SetupParams, SubcircuitInfo } from './types.ts';
import { createInfoByName, structCheckForFrontendConfig, structCheckForGlobalWireList, structCheckForSetupParams, structCheckForSubcircuitInfo } from './utils.ts'
import { BUFFER_LIST, ReservedBuffer, SubcircuitInfoByName, SubcircuitInfoByNameEntry } from './configuredTypes.ts';
import setupParamsJson from '../../../../qap-compiler/subcircuits/library/setupParams.json' with {type: 'json'};
import globalWireListJson from '../../../../qap-compiler/subcircuits/library/globalWireList.json' with {type: 'json'};
import frontendCfgJson from '../../../../qap-compiler/subcircuits/library/frontendCfg.json' with {type: 'json'};
import subcircuitInfoJson from '../../../../qap-compiler/subcircuits/library/subcircuitInfo.json' with {type: 'json'};




// // -----------------------------------------------------------------------------
// // Load compiler JSONs concurrently (URL-based, platform-safe)
// // -----------------------------------------------------------------------------
// const [gRaw, sRaw, scRaw] = await Promise.all([
//   readJson(new URL('subcircuits/library/globalWireList.json', BASE_URL)),
//   readJson(new URL('subcircuits/library/setupParams.json', BASE_URL)),
//   readJson(new URL('subcircuits/library/subcircuitInfo.json', BASE_URL)),
// ]);

// Validate and expose typed constants
structCheckForGlobalWireList(globalWireListJson);
structCheckForSetupParams(setupParamsJson);
structCheckForSubcircuitInfo(subcircuitInfoJson);
structCheckForFrontendConfig(frontendCfgJson);

export const globalWireList: GlobalWireList = globalWireListJson;
export const setupParams: SetupParams = setupParamsJson;
export const subcircuitInfo: SubcircuitInfo = subcircuitInfoJson;
export const subcircuitInfoByName: SubcircuitInfoByName = createInfoByName(subcircuitInfo)
const frontendCfg: FrontendConfig = frontendCfgJson;

export const SUBCIRCUIT_BUFFER_MAPPING: Record<ReservedBuffer, SubcircuitInfoByNameEntry | undefined> = {
  PUBLIC_OUT: subcircuitInfoByName.get('bufferPubOut'),
  PUBLIC_IN: subcircuitInfoByName.get('bufferPubIn'),
  BLOCK_IN: subcircuitInfoByName.get('bufferBlockIn'),
  EVM_IN: subcircuitInfoByName.get('bufferEVMIn'),
  PRIVATE_IN: subcircuitInfoByName.get('bufferPrvIn'),
}

export const ACCUMULATOR_INPUT_LIMIT = frontendCfg.nAccumulation
// export const MAX_TX_NUMBER = qapCompilerParams.nTx
export const MT_DEPTH = frontendCfg.nMtDepth
export const POSEIDON_INPUTS = frontendCfg.nPoseidonInputs
export const MAX_MT_LEAVES = POSEIDON_INPUTS ** MT_DEPTH
export const NUMBER_OF_PREV_BLOCK_HASHES = frontendCfg.nPrevBlockHashes
export const JUBJUB_EXP_BATCH_SIZE = frontendCfg.nJubjubExpBatch
export const ARITH_EXP_BATCH_SIZE = frontendCfg.nSubExpBatch

export const FIRST_ARITHMETIC_PLACEMENT_INDEX = BUFFER_LIST.length
