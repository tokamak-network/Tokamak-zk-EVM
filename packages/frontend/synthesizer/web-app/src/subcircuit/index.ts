import {
  loadResolvedSubcircuitLibrary,
  loadSubcircuitWasmBuffers,
  type SynthesisInput,
  type SynthesisPayloadInput,
} from '../../../core/src/app.ts';
import {
  parseSubcircuitLibraryData,
  type SubcircuitLibraryProvider,
} from '../../../core/src/qapCompiler.ts';
import { loadJsonFromBlob, loadJsonFromUrl } from '../input/index.ts';
import type { FetchSubcircuitLibrarySource, SubcircuitLibraryFiles } from '../types.ts';

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

export function createFetchSubcircuitLibraryProvider(
  source: FetchSubcircuitLibrarySource,
): SubcircuitLibraryProvider {
  const baseUrl = trimTrailingSlashes(source.baseUrl);
  const fetchImpl = source.fetchImpl ?? fetch;

  return {
    async getData() {
      const [setupParams, globalWireList, frontendCfg, subcircuitInfo] = await Promise.all([
        loadJsonFromUrl(`${baseUrl}/setupParams.json`, undefined, fetchImpl),
        loadJsonFromUrl(`${baseUrl}/globalWireList.json`, undefined, fetchImpl),
        loadJsonFromUrl(`${baseUrl}/frontendCfg.json`, undefined, fetchImpl),
        loadJsonFromUrl(`${baseUrl}/subcircuitInfo.json`, undefined, fetchImpl),
      ]);

      return parseSubcircuitLibraryData({
        setupParams,
        globalWireList,
        frontendCfg,
        subcircuitInfo,
      });
    },
    async loadWasm(subcircuitId: number) {
      const response = await fetchImpl(`${baseUrl}/wasm/subcircuit${subcircuitId}.wasm`);
      if (!response.ok) {
        throw new Error(
          `Failed to load subcircuit${subcircuitId}.wasm: ${response.status} ${response.statusText}`,
        );
      }

      return response.arrayBuffer();
    },
  };
}

export function createFileSubcircuitLibraryProvider(
  files: SubcircuitLibraryFiles,
): SubcircuitLibraryProvider {
  return {
    async getData() {
      const [setupParams, globalWireList, frontendCfg, subcircuitInfo] = await Promise.all([
        loadJsonFromBlob(files.setupParams),
        loadJsonFromBlob(files.globalWireList),
        loadJsonFromBlob(files.frontendCfg),
        loadJsonFromBlob(files.subcircuitInfo),
      ]);

      return parseSubcircuitLibraryData({
        setupParams,
        globalWireList,
        frontendCfg,
        subcircuitInfo,
      });
    },
    async loadWasm(subcircuitId: number) {
      const wasmFile = files.wasmFiles[subcircuitId];
      if (wasmFile === undefined) {
        throw new Error(`Missing uploaded WASM file for subcircuit${subcircuitId}.wasm`);
      }

      return wasmFile.arrayBuffer();
    },
  };
}

export async function prepareSynthesisInput(
  payload: SynthesisPayloadInput,
  provider: SubcircuitLibraryProvider,
): Promise<SynthesisInput> {
  const subcircuitLibrary = await loadResolvedSubcircuitLibrary(provider);
  const wasmBuffers = await loadSubcircuitWasmBuffers(
    provider,
    subcircuitLibrary.data.subcircuitInfo,
  );

  return {
    ...payload,
    subcircuitLibrary,
    wasmBuffers,
  };
}
