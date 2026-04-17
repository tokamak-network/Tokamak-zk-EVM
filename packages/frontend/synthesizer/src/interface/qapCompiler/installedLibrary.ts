import setupParamsJson from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/setupParams.json';
import globalWireListJson from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/globalWireList.json';
import frontendCfgJson from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/frontendCfg.json';
import subcircuitInfoJson from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/subcircuitInfo.json';
import {
  resolveSubcircuitLibrary,
} from './utils.ts';
import type { SubcircuitLibraryData } from './types.ts';

export const installedSubcircuitLibraryData: SubcircuitLibraryData = {
  setupParams: setupParamsJson,
  globalWireList: globalWireListJson,
  frontendCfg: frontendCfgJson,
  subcircuitInfo: subcircuitInfoJson,
};

export const installedSubcircuitLibrary = resolveSubcircuitLibrary(
  installedSubcircuitLibraryData,
);
