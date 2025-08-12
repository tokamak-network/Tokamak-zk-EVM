// Static imports for QAP compiler files to fix binary compilation
// This replaces the dynamic imports that don't work in compiled binaries

import { subcircuits as _subcircuits } from '../../../qap-compiler/subcircuits/library/subcircuitInfo.js';
import { globalWireList as _globalWireList } from '../../../qap-compiler/subcircuits/library/globalWireList.js';
import { setupParams as _setupParams } from '../../../qap-compiler/subcircuits/library/setupParams.js';

export const subcircuits = _subcircuits;
export const globalWireList = _globalWireList;
export const setupParams = _setupParams;

// WASM directory path (static for binary)
export const wasmDir = './qap-compiler/subcircuits/library/wasm';
