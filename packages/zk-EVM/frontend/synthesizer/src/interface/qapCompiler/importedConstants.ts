import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { CircomConstMap, GlobalWireList, SetupParams, SubcircuitInfo } from './types.ts';
import { createInfoByName, readJson, structCheckForGlobalWireList, structCheckForSetupParams, structCheckForSubcircuitInfo } from './utils.ts'
import { BUFFER_LIST, ReservedBuffer, SubcircuitInfoByName, SubcircuitInfoByNameEntry } from './configuredTypes.ts';
// -----------------------------------------------------------------------------
// Load compiler JSONs concurrently (URL-based, platform-safe)
// -----------------------------------------------------------------------------
const require = createRequire(import.meta.url);
const qapPkgJsonPath = require.resolve('@tokamak-zk-evm/qap-compiler/package.json');
const QAP_BASE_URL = new URL('./', new URL(`file://${qapPkgJsonPath}`));

const [gRaw, sRaw, scRaw] = await Promise.all([
  readJson(new URL('subcircuits/library/globalWireList.json', QAP_BASE_URL)),
  readJson(new URL('subcircuits/library/setupParams.json', QAP_BASE_URL)),
  readJson(new URL('subcircuits/library/subcircuitInfo.json', QAP_BASE_URL)),
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
export const wasmDir = fileURLToPath(new URL('subcircuits/library/wasm', QAP_BASE_URL));
export const FIRST_ARITHMETIC_PLACEMENT_INDEX = BUFFER_LIST.length
