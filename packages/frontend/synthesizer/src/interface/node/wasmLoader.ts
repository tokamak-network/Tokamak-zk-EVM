import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import {
  installedSubcircuitLibraryData,
} from '../qapCompiler/installedLibrary.ts';
import type { SubcircuitLibraryProvider } from '../qapCompiler/libraryTypes.ts';
import type { SubcircuitInfo } from '../qapCompiler/libraryTypes.ts';

function getBaseURL(): URL {
  if (typeof window !== "undefined") {
    throw new Error("getBaseURL must run on the server");
  }

  const subcircuitLibraryRoot = path.dirname(
    typeof require === 'function' && typeof require.resolve === 'function'
      ? require.resolve('@tokamak-zk-evm/subcircuit-library/package.json')
      : fileURLToPath(import.meta.resolve('@tokamak-zk-evm/subcircuit-library/package.json')),
  );

  const isBun = Reflect.get(process, 'isBun');
  if (isBun === true && process.execPath) {
    const execDir = path.dirname(process.execPath);
    return pathToFileURL(path.resolve(execDir, "../resource/qap-compiler") + path.sep);
  }

  return pathToFileURL(path.resolve(subcircuitLibraryRoot, "subcircuits") + path.sep);
}

const BASE_URL = getBaseURL();

// Derived path for WASM artifacts (filesystem path)
export const wasmDir = fileURLToPath(new URL('library/wasm', BASE_URL));

export async function loadSubcircuitWasmBuffer(subcircuitId: number): Promise<ArrayBuffer> {
  const targetWasmPath = path.resolve(wasmDir, `subcircuit${subcircuitId}.wasm`);
  let buffer: Buffer;
  try {
    buffer = readFileSync(targetWasmPath);
  } catch {
    throw new Error(`Error while reading subcircuit${subcircuitId}.wasm`);
  }
  return Uint8Array.from(buffer).buffer;
}

export const nodeSubcircuitLibraryProvider: SubcircuitLibraryProvider = {
  async getData() {
    return installedSubcircuitLibraryData;
  },
  async loadWasm(subcircuitId: number) {
    return loadSubcircuitWasmBuffer(subcircuitId);
  },
};

export function loadSubcircuitWasm(
  subcircuitInfo: SubcircuitInfo = installedSubcircuitLibraryData.subcircuitInfo,
): any[] {
  const witnessCalculatorbuffers: any[] = [];
  for (const subcircuit of subcircuitInfo) {
    const id = subcircuit.id;
    let buffer;
    const targetWasmPath = path.resolve(wasmDir, `subcircuit${id}.wasm`);
    try {
        buffer = readFileSync(targetWasmPath);
    } catch (err) {
        throw new Error(`Error while reading subcircuit${id}.wasm`);
    }
    witnessCalculatorbuffers[id] = buffer;
  }
  return witnessCalculatorbuffers
}
