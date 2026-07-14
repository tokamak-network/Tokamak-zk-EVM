let wasmModulePromise;
let initializedPromise;

export async function loadCombinedSigmaPayloadDecoder(options = {}) {
  const wasmModule = await loadWasmModule();

  if (initializedPromise === undefined) {
    initializedPromise = wasmModule.default(options.wasmUrl);
  }

  await initializedPromise;

  return {
    async decodeCombinedSigmaPayload(input) {
      return wasmModule.decodeCombinedSigma(input);
    },
  };
}

async function loadWasmModule() {
  if (wasmModulePromise === undefined) {
    wasmModulePromise = import("../pkg/backend_wasm_rkyv_decoder.js");
  }

  return wasmModulePromise;
}
