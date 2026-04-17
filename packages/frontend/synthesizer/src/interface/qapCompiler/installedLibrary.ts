import setupParamsJson from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/setupParams.json';
import globalWireListJson from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/globalWireList.json';
import frontendCfgJson from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/frontendCfg.json';
import subcircuitInfoJson from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/subcircuitInfo.json';
import { BUFFER_LIST } from './configuredTypes.ts';
import type {
  CircomKey,
  SubcircuitLibraryData,
} from './types.ts';
import {
  isNumber,
  isTupleNumber2,
  REQUIRED_CIRCOM_KEYS,
  type ResolvedSubcircuitLibrary,
  SETUP_PARAMS_KEYS,
  SUBCIRCUIT_INFO_VALIDATORS,
  type ValidatorMap,
} from './types.ts';
import { createInfoByName } from './utils.ts';

export const installedSubcircuitLibraryData: SubcircuitLibraryData = {
  setupParams: setupParamsJson,
  globalWireList: globalWireListJson,
  frontendCfg: frontendCfgJson,
  subcircuitInfo: subcircuitInfoJson,
};

const data = installedSubcircuitLibraryData;

if (!Array.isArray(data.globalWireList) || data.globalWireList.some((entry) => !isTupleNumber2(entry))) {
  throw new Error('Invalid shape for globalWireList.json: expected [number, number][]');
}

if (typeof data.setupParams !== 'object' || data.setupParams === null) {
  throw new Error('Invalid shape for setupParams.json: expected object');
}

const setupParamsObject = data.setupParams as Record<string, unknown>;
if (!SETUP_PARAMS_KEYS.every((key) => isNumber(setupParamsObject[key]))) {
  throw new Error('Invalid values in setupParams.json: all keys must be finite numbers');
}

if (typeof data.frontendCfg !== 'object' || data.frontendCfg === null) {
  throw new Error('Invalid shape for frontendCfg.json: expected object');
}

const frontendConfigObject = data.frontendCfg as Record<string, unknown>;
if (!REQUIRED_CIRCOM_KEYS.every((key) => isNumber(frontendConfigObject[key]))) {
  throw new Error('Invalid values in frontendCfg.json: all keys must be finite numbers');
}
for (const key of Object.keys(frontendConfigObject)) {
  if (!REQUIRED_CIRCOM_KEYS.includes(key as CircomKey)) {
    throw new Error(`Unexpected key in frontendCfg.json: ${key}`);
  }
}

if (!Array.isArray(data.subcircuitInfo)) {
  throw new Error('Invalid shape for subcircuitInfo.json: expected array');
}
for (const entry of data.subcircuitInfo) {
  if (typeof entry !== 'object' || entry === null) {
    throw new Error('Invalid item in subcircuitInfo.json: expected object');
  }
  const objectEntry = entry as Record<string, unknown>;
  for (const key in SUBCIRCUIT_INFO_VALIDATORS) {
    const check = SUBCIRCUIT_INFO_VALIDATORS[key as keyof ValidatorMap] as (value: unknown) => boolean;
    if (!check(objectEntry[key])) {
      throw new Error(`Invalid field in subcircuitInfo.json: ${key}`);
    }
  }
}

const subcircuitInfoByName = createInfoByName(data.subcircuitInfo);

export const installedSubcircuitLibrary: ResolvedSubcircuitLibrary = {
  data,
  subcircuitInfoByName,
  subcircuitBufferMapping: {
    PUBLIC_OUT: subcircuitInfoByName.get('bufferPubOut'),
    PUBLIC_IN: subcircuitInfoByName.get('bufferPubIn'),
    BLOCK_IN: subcircuitInfoByName.get('bufferBlockIn'),
    EVM_IN: subcircuitInfoByName.get('bufferEVMIn'),
    PRIVATE_IN: subcircuitInfoByName.get('bufferPrvIn'),
  },
  accumulatorInputLimit: data.frontendCfg.nAccumulation,
  numberOfPrevBlockHashes: data.frontendCfg.nPrevBlockHashes,
  jubjubExpBatchSize: data.frontendCfg.nJubjubExpBatch,
  arithExpBatchSize: data.frontendCfg.nSubExpBatch,
  firstArithmeticPlacementIndex: BUFFER_LIST.length,
};
