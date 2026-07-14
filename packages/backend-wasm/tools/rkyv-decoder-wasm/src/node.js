import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const generatedJsPath = join(packageRoot, "pkg", "backend_wasm_rkyv_decoder.js");
const generatedWasmPath = join(packageRoot, "pkg", "backend_wasm_rkyv_decoder_bg.wasm");

let wasmModulePromise;
let initializedPromise;

export async function loadCombinedSigmaPayloadDecoder() {
  const wasmModule = await loadWasmModule();

  if (initializedPromise === undefined) {
    initializedPromise = initializeWasmModule(wasmModule);
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
    wasmModulePromise = import(pathToFileURL(generatedJsPath).href).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load generated rkyv decoder package. Run npm run rkyv-decoder:build first. ${message}`);
    });
  }

  return wasmModulePromise;
}

async function initializeWasmModule(wasmModule) {
  let wasmBytes;
  try {
    wasmBytes = await readFile(generatedWasmPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read generated rkyv decoder WASM. Run npm run rkyv-decoder:build first. ${message}`);
  }

  wasmModule.initSync({ module: wasmBytes });
}
