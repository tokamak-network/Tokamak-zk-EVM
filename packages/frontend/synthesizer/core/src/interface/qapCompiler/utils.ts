import {
  FrontendConfig,
  GlobalWireList,
  SetupParams,
  SubcircuitInfo,
  SubcircuitLibraryData,
} from './libraryTypes.ts';
import {
  SUBCIRCUIT_LIST,
  SubcircuitInfoByName,
  SubcircuitInfoByNameEntry,
  SubcircuitNames,
} from './configuredTypes.ts';
import {
  isNumber,
  isNumberArray,
  isObjectRecord,
  isSubcircuitName,
  isTupleNumber2,
  REQUIRED_CIRCOM_KEYS,
  SETUP_PARAMS_KEYS,
} from './libraryTypes.ts';

const getRequiredNumber = (record: Record<string, unknown>, key: string): number => {
  const value = record[key];
  if (!isNumber(value)) {
    throw new Error(`Invalid numeric value for ${key}`);
  }
  return value;
};

export function parseSetupParams(value: unknown): SetupParams {
  if (!isObjectRecord(value)) {
    throw new Error('Invalid shape for setupParams.json: expected object');
  }

  if (!SETUP_PARAMS_KEYS.every((key) => isNumber(value[key]))) {
    throw new Error('Invalid values in setupParams.json: all keys must be finite numbers');
  }

  return {
    l_free: getRequiredNumber(value, 'l_free'),
    l_user_out: getRequiredNumber(value, 'l_user_out'),
    l_user: getRequiredNumber(value, 'l_user'),
    l: getRequiredNumber(value, 'l'),
    l_D: getRequiredNumber(value, 'l_D'),
    m_D: getRequiredNumber(value, 'm_D'),
    n: getRequiredNumber(value, 'n'),
    s_D: getRequiredNumber(value, 's_D'),
    s_max: getRequiredNumber(value, 's_max'),
  };
}

export function parseGlobalWireList(value: unknown): GlobalWireList {
  if (!Array.isArray(value) || value.some((entry) => !isTupleNumber2(entry))) {
    throw new Error('Invalid shape for globalWireList.json: expected [number, number][]');
  }

  return value.map(([subcircuitId, localWireIndex]) => [subcircuitId, localWireIndex]);
}

export function parseFrontendConfig(value: unknown): FrontendConfig {
  if (!isObjectRecord(value)) {
    throw new Error('Invalid shape for frontendCfg.json: expected object');
  }

  if (!REQUIRED_CIRCOM_KEYS.every((key) => isNumber(value[key]))) {
    throw new Error('Invalid values in frontendCfg.json: all keys must be finite numbers');
  }

  for (const key of Object.keys(value)) {
    if (!REQUIRED_CIRCOM_KEYS.some((requiredKey) => requiredKey === key)) {
      throw new Error(`Unexpected key in frontendCfg.json: ${key}`);
    }
  }

  return {
    nPubIn: getRequiredNumber(value, 'nPubIn'),
    nPubOut: getRequiredNumber(value, 'nPubOut'),
    nPrvIn: getRequiredNumber(value, 'nPrvIn'),
    nEVMIn: getRequiredNumber(value, 'nEVMIn'),
    nPoseidonInputs: getRequiredNumber(value, 'nPoseidonInputs'),
    nMtDepth: getRequiredNumber(value, 'nMtDepth'),
    nAccumulation: getRequiredNumber(value, 'nAccumulation'),
    nPrevBlockHashes: getRequiredNumber(value, 'nPrevBlockHashes'),
    nJubjubExpBatch: getRequiredNumber(value, 'nJubjubExpBatch'),
    nSubExpBatch: getRequiredNumber(value, 'nSubExpBatch'),
  };
}

export function parseSubcircuitInfo(value: unknown): SubcircuitInfo {
  if (!Array.isArray(value)) {
    throw new Error('Invalid shape for subcircuitInfo.json: expected array');
  }

  return value.map((entry) => {
    if (!isObjectRecord(entry)) {
      throw new Error('Invalid item in subcircuitInfo.json: expected object');
    }

    const id = entry.id;
    const name = entry.name;
    const nWires = entry.Nwires;
    const nConsts = entry.Nconsts;
    const outIdx = entry.Out_idx;
    const inIdx = entry.In_idx;
    const flattenMap = entry.flattenMap;

    if (!isNumber(id)) throw new Error('Invalid field in subcircuitInfo.json: id');
    if (!isSubcircuitName(name)) throw new Error('Invalid field in subcircuitInfo.json: name');
    if (!isNumber(nWires)) throw new Error('Invalid field in subcircuitInfo.json: Nwires');
    if (!isNumber(nConsts)) throw new Error('Invalid field in subcircuitInfo.json: Nconsts');
    if (!isTupleNumber2(outIdx)) throw new Error('Invalid field in subcircuitInfo.json: Out_idx');
    if (!isTupleNumber2(inIdx)) throw new Error('Invalid field in subcircuitInfo.json: In_idx');
    if (!isNumberArray(flattenMap)) throw new Error('Invalid field in subcircuitInfo.json: flattenMap');

    return {
      id,
      name,
      Nwires: nWires,
      Nconsts: nConsts,
      Out_idx: [outIdx[0], outIdx[1]],
      In_idx: [inIdx[0], inIdx[1]],
      flattenMap: [...flattenMap],
    };
  });
}

export function parseSubcircuitLibraryData(input: {
  setupParams: unknown;
  globalWireList: unknown;
  frontendCfg: unknown;
  subcircuitInfo: unknown;
}): SubcircuitLibraryData {
  return {
    setupParams: parseSetupParams(input.setupParams),
    globalWireList: parseGlobalWireList(input.globalWireList),
    frontendCfg: parseFrontendConfig(input.frontendCfg),
    subcircuitInfo: parseSubcircuitInfo(input.subcircuitInfo),
  };
}

export function createInfoByName(subcircuitInfo: SubcircuitInfo): SubcircuitInfoByName {
  const subcircuitInfoByName = new Map<
    SubcircuitNames,
    SubcircuitInfoByNameEntry
  >();

  for (const subcircuit of subcircuitInfo) {
    const entryObject: SubcircuitInfoByNameEntry = {
      id: subcircuit.id,
      name: subcircuit.name,
      NWires: subcircuit.Nwires,
      NInWires: subcircuit.In_idx[1],
      NOutWires: subcircuit.Out_idx[1],
      inWireIndex: subcircuit.In_idx[0],
      outWireIndex: subcircuit.Out_idx[0],
      flattenMap: subcircuit.flattenMap,
    };

    subcircuitInfoByName.set(subcircuit.name, entryObject);
  }

  return subcircuitInfoByName;
}
