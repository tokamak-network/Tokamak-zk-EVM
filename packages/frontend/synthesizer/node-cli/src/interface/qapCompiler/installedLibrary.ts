import setupParamsJson from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/setupParams.json' with { type: 'json' };
import globalWireListJson from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/globalWireList.json' with { type: 'json' };
import frontendCfgJson from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/frontendCfg.json' with { type: 'json' };
import subcircuitInfoJson from '@tokamak-zk-evm/subcircuit-library/subcircuits/library/subcircuitInfo.json' with { type: 'json' };
import {
  parseSubcircuitLibraryData,
  resolveSubcircuitLibraryData,
} from '../../core.ts';
import type {
  ResolvedSubcircuitLibrary,
  SubcircuitLibraryData,
} from '../../core.ts';

export const installedSubcircuitLibraryData: SubcircuitLibraryData = parseSubcircuitLibraryData({
  setupParams: setupParamsJson,
  globalWireList: globalWireListJson,
  frontendCfg: frontendCfgJson,
  subcircuitInfo: subcircuitInfoJson,
});

export const installedSubcircuitLibrary: ResolvedSubcircuitLibrary =
  resolveSubcircuitLibraryData(installedSubcircuitLibraryData);
