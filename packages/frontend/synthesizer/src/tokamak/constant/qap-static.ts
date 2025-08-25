// Static imports for QAP compiler files to fix binary compilation
// This replaces the dynamic imports that don't work in compiled binaries

import path from 'path';
import { subcircuits as _subcircuits } from '../../../../qap-compiler/subcircuits/library/subcircuitInfo.js';
import { globalWireList as _globalWireList } from '../../../../qap-compiler/subcircuits/library/globalWireList.js';
import { setupParams as _setupParams } from '../../../../qap-compiler/subcircuits/library/setupParams.js';

export const subcircuits = _subcircuits;
export const globalWireList = _globalWireList;
export const setupParams = _setupParams;

// WASM directory path (dynamic based on execution environment)
function getWasmDir(): string {
  // Check if running as Bun binary
  if ((process as any).isBun && process.execPath) {
    // Running as binary - use absolute path relative to binary location
    const binaryDir = path.dirname(process.execPath);
    return path.join(
      binaryDir,
      'qap-compiler',
      'subcircuits',
      'library',
      'wasm',
    );
  }

  // Running in development - use external qap-compiler package path
  return '../qap-compiler/subcircuits/library/wasm';
}

export const wasmDir = getWasmDir();
