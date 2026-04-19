import { BUFFER_LIST } from '../subcircuit/configuredTypes.ts';
import type {
  ResolvedSubcircuitLibrary,
  SubcircuitInfo,
  SubcircuitLibraryData,
  SubcircuitLibraryProvider,
} from '../subcircuit/libraryTypes.ts';
import { createInfoByName } from '../subcircuit/utils.ts';

export function resolveSubcircuitLibraryData(
  data: SubcircuitLibraryData,
): ResolvedSubcircuitLibrary {
  const subcircuitInfoByName = createInfoByName(data.subcircuitInfo);

  return {
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
}

export async function loadResolvedSubcircuitLibrary(
  provider: SubcircuitLibraryProvider,
): Promise<ResolvedSubcircuitLibrary> {
  return resolveSubcircuitLibraryData(await provider.getData());
}

export async function loadSubcircuitWasmBuffers(
  provider: SubcircuitLibraryProvider,
  subcircuitInfo: SubcircuitInfo,
): Promise<ArrayBuffer[]> {
  const wasmBuffers: ArrayBuffer[] = [];

  await Promise.all(
    subcircuitInfo.map(async (subcircuit) => {
      wasmBuffers[subcircuit.id] = await provider.loadWasm(subcircuit.id);
    }),
  );

  return wasmBuffers;
}
