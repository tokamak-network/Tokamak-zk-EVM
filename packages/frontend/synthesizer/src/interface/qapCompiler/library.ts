import {
  BUFFER_LIST,
  type ReservedBuffer,
  type SubcircuitInfoByName,
  type SubcircuitInfoByNameEntry,
} from './configuredTypes.ts';
import type {
  FrontendConfig,
  GlobalWireList,
  SetupParams,
  SubcircuitInfo,
} from './types.ts';
import {
  createInfoByName,
  structCheckForFrontendConfig,
  structCheckForGlobalWireList,
  structCheckForSetupParams,
  structCheckForSubcircuitInfo,
} from './utils.ts';

export interface SubcircuitLibraryData {
  setupParams: SetupParams;
  globalWireList: GlobalWireList;
  frontendCfg: FrontendConfig;
  subcircuitInfo: SubcircuitInfo;
}

export interface SubcircuitLibraryProvider {
  getData(): Promise<SubcircuitLibraryData>;
  loadWasm(subcircuitId: number): Promise<ArrayBuffer>;
}

export interface ResolvedSubcircuitLibrary {
  data: SubcircuitLibraryData;
  subcircuitInfoByName: SubcircuitInfoByName;
  subcircuitBufferMapping: Record<ReservedBuffer, SubcircuitInfoByNameEntry | undefined>;
  accumulatorInputLimit: number;
  numberOfPrevBlockHashes: number;
  jubjubExpBatchSize: number;
  arithExpBatchSize: number;
  firstArithmeticPlacementIndex: number;
}

export function validateSubcircuitLibraryData(data: SubcircuitLibraryData): void {
  structCheckForGlobalWireList(data.globalWireList);
  structCheckForSetupParams(data.setupParams);
  structCheckForSubcircuitInfo(data.subcircuitInfo);
  structCheckForFrontendConfig(data.frontendCfg);
}

export function resolveSubcircuitLibrary(
  data: SubcircuitLibraryData,
): ResolvedSubcircuitLibrary {
  validateSubcircuitLibraryData(data);

  const subcircuitInfoByName = createInfoByName(data.subcircuitInfo);
  const subcircuitBufferMapping: Record<
    ReservedBuffer,
    SubcircuitInfoByNameEntry | undefined
  > = {
    PUBLIC_OUT: subcircuitInfoByName.get('bufferPubOut'),
    PUBLIC_IN: subcircuitInfoByName.get('bufferPubIn'),
    BLOCK_IN: subcircuitInfoByName.get('bufferBlockIn'),
    EVM_IN: subcircuitInfoByName.get('bufferEVMIn'),
    PRIVATE_IN: subcircuitInfoByName.get('bufferPrvIn'),
  };

  return {
    data,
    subcircuitInfoByName,
    subcircuitBufferMapping,
    accumulatorInputLimit: data.frontendCfg.nAccumulation,
    numberOfPrevBlockHashes: data.frontendCfg.nPrevBlockHashes,
    jubjubExpBatchSize: data.frontendCfg.nJubjubExpBatch,
    arithExpBatchSize: data.frontendCfg.nSubExpBatch,
    firstArithmeticPlacementIndex: BUFFER_LIST.length,
  };
}
