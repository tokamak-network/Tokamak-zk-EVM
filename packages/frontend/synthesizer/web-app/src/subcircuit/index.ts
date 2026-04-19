import {
  loadResolvedSubcircuitLibrary,
  loadSubcircuitWasmBuffers,
  type SynthesisInput,
  type SynthesisPayloadInput,
} from '../../../core/src/app.ts';
import { parseSubcircuitLibraryData } from '../../../core/src/subcircuit.ts';
import {
  frontendCfgJson,
  globalWireListJson,
  setupParamsJson,
  subcircuitInfoJson,
  wasmFiles,
} from './bundled.generated.ts';

const bundledSubcircuitLibraryData = parseSubcircuitLibraryData({
  setupParams: setupParamsJson,
  globalWireList: globalWireListJson,
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
  | Promise<Pick<SynthesisInput, 'subcircuitLibrary' | 'wasmBuffers'>>
  | undefined;

async function getPreparedRuntime(): Promise<Pick<SynthesisInput, 'subcircuitLibrary' | 'wasmBuffers'>> {
  if (preparedRuntimePromise === undefined) {
    preparedRuntimePromise = (async () => {
      const subcircuitLibrary = await loadResolvedSubcircuitLibrary(
        bundledSubcircuitLibraryProvider,
      );
      const wasmBuffers = await loadSubcircuitWasmBuffers(
        bundledSubcircuitLibraryProvider,
        subcircuitLibrary.data.subcircuitInfo,
      );

      return {
        subcircuitLibrary,
        wasmBuffers,
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
