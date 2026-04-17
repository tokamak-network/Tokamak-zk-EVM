import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import {
  installedSubcircuitLibraryData,
} from '../qapCompiler/index.ts';
import type { SubcircuitLibraryProvider } from '../qapCompiler/types.ts';
import type { SubcircuitInfo } from '../qapCompiler/types.ts';

// -----------------------------------------------------------------------------
// Base location (ESM-friendly): resolve everything relative to this module
// When running as a Bun binary, use the executable's directory
// -----------------------------------------------------------------------------
// function getBaseURL(): URL {
//   // Check if running as a Bun compiled binary
//   if ((process as any).isBun && (process as any).execPath) {
//     // Running as binary: use executable's parent directory
//     // e.g., /path/to/dist/bin/synthesizer -> /path/to/dist/
//     const execPath = (process as any).execPath as string;
//     const execDir = fileURLToPath(new URL('.', `file://${execPath}`));
//     // Go up one level from bin/ to get to the base directory
//     return new URL('../resource/qap-compiler/', `file://${execDir}`);
//   }

//   // Development mode: use import.meta.url
//   return new URL('../../../../qap-compiler/', import.meta.url);
// }

function getBaseURL(): URL {
  if (typeof window !== "undefined") {
    throw new Error("getBaseURL must run on the server");
  }

  const subcircuitLibraryRoot = path.dirname(
    typeof require !== 'undefined' && typeof require.resolve === 'function'
      ? require.resolve('@tokamak-zk-evm/subcircuit-library/package.json')
      : fileURLToPath(import.meta.resolve('@tokamak-zk-evm/subcircuit-library/package.json')),
  );

  if ((process as any).isBun && (process as any).execPath) {
    const execPath = (process as any).execPath as string;
    const execDir = path.dirname(execPath);
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
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
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
