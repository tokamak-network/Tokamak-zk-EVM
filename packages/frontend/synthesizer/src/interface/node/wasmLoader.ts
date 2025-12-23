import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { subcircuitInfo } from '../qapCompiler/importedConstants.ts';
import appRootPath from 'app-root-path';
import { readFileSync } from 'node:fs';

// -----------------------------------------------------------------------------
// Base location (ESM-friendly): resolve everything relative to this module
// When running as a Bun binary, use the executable's directory
// -----------------------------------------------------------------------------
// function getBaseURL(): URL {
//   // Check if running as a Bun compiled binary
//   if ((process as any).isBun && (process as any).execPath) {
//     // Running as binary: use executable's parent directory
//     // e.g., /path/to/dist/macOS/bin/synthesizer -> /path/to/dist/macOS/
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

  if ((process as any).isBun && (process as any).execPath) {
    const execPath = (process as any).execPath as string;
    const execDir = path.dirname(execPath);
    return pathToFileURL(path.resolve(execDir, "../resource/qap-compiler") + path.sep);
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  return pathToFileURL(path.resolve(here, "../../../../qap-compiler") + path.sep);
}

const BASE_URL = getBaseURL();

// Derived path for WASM artifacts (filesystem path)
export const wasmDir = fileURLToPath(new URL('subcircuits/library/wasm', BASE_URL));

export function loadSubcircuitWasm(): any[] {
  const witnessCalculatorbuffers: any[] = [];
  for (const subcircuit of subcircuitInfo) {
    const id = subcircuit.id;
    let buffer;
    const targetWasmPath = path.resolve(appRootPath.path, wasmDir, `subcircuit${id}.wasm`);
    try {
        buffer = readFileSync(targetWasmPath);
    } catch (err) {
        throw new Error(`Error while reading subcircuit${id}.wasm`);
    }
    witnessCalculatorbuffers[id] = buffer;
  }
  return witnessCalculatorbuffers
}
