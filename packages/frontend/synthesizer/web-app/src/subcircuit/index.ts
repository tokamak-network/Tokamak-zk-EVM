import {
  loadResolvedSubcircuitLibrary,
  type SynthesisInput,
  type SynthesisPayloadInput,
} from '../../../core/src/app.ts';
import { parseSubcircuitLibraryData } from '../../../core/src/subcircuit.ts';
import {
  frontendCfgJson,
  setupParamsJson,
  subcircuitInfoJson,
  wasmFiles,
} from './bundled.generated.ts';

const bundledSubcircuitLibraryData = parseSubcircuitLibraryData({
  setupParams: setupParamsJson,
  frontendCfg: frontendCfgJson,
  subcircuitInfo: subcircuitInfoJson,
});

const bundledSubcircuitLibraryProvider = {
  async getData() {
    return bundledSubcircuitLibraryData;
  },
  async loadWasm(subcircuitId: number): Promise<ArrayBuffer> {
    const wasmFile = wasmFiles[subcircuitId];
    if (wasmFile === undefined) {
      throw new Error(`Missing bundled WASM file for subcircuit${subcircuitId}.wasm`);
    }

    return wasmFile.slice().buffer;
  },
};

let preparedRuntimePromise:
  | Promise<Pick<SynthesisInput, 'subcircuitLibrary'>>
  | undefined;

async function getPreparedRuntime(): Promise<Pick<SynthesisInput, 'subcircuitLibrary'>> {
  if (preparedRuntimePromise === undefined) {
    preparedRuntimePromise = (async () => {
      const subcircuitLibrary = await loadResolvedSubcircuitLibrary(
        bundledSubcircuitLibraryProvider,
      );
      return {
        subcircuitLibrary,
      };
    })();
  }

  return preparedRuntimePromise;
}

export async function prepareSynthesisInput(
  payload: SynthesisPayloadInput,
): Promise<SynthesisInput> {
  return {
    ...payload,
    ...(await getPreparedRuntime()),
  };
}
