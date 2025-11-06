// For development - uses dynamic imports to load QAP compiler generated files
import path from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

export * from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to dynamically import modules from QAP compiler
async function importQapModule(relativePath: string, exportName: string) {
  const modulePath = path.join(__dirname, relativePath);
  const moduleUrl = pathToFileURL(modulePath).href;
  const module = await import(moduleUrl);
  return module[exportName];
}

// Dynamic imports for QAP compiler generated files
const BASE_PATH = '../../../../qap-compiler/subcircuits/library';

let _subcircuits: any;
let _globalWireList: any;
let _setupParams: any;

async function loadQapModules() {
  if (!_subcircuits) {
    const [s, g, p] = await Promise.all([
      importQapModule(`${BASE_PATH}/subcircuitInfo.js`, 'subcircuits'),
      importQapModule(`${BASE_PATH}/globalWireList.js`, 'globalWireList'),
      importQapModule(`${BASE_PATH}/setupParams.js`, 'setupParams'),
    ]);
    _subcircuits = s;
    _globalWireList = g;
    _setupParams = p;
  }
  return {
    subcircuits: _subcircuits,
    globalWireList: _globalWireList,
    setupParams: _setupParams,
  };
}

// Export QAP modules - conditional loading based on environment
export async function getQapModules() {
  // Check if running as Bun binary
  if ((process as any).isBun && process.execPath) {
    // Use static imports for binary compilation
    const qapStatic = await import('./qap-static.js');
    return {
      subcircuits: qapStatic.subcircuits,
      globalWireList: qapStatic.globalWireList,
      setupParams: qapStatic.setupParams,
      wasmDir: qapStatic.wasmDir,
    };
  } else {
    // Use dynamic imports for runtime
    const { subcircuits, globalWireList, setupParams } = await loadQapModules();
    return {
      subcircuits,
      globalWireList,
      setupParams,
      wasmDir: '../qap-compiler/subcircuits/library/wasm',
    };
  }
}

// For backward compatibility, export individual modules
const qapModules = await getQapModules();
export const subcircuits = qapModules.subcircuits;
export const globalWireList = qapModules.globalWireList;
export const setupParams = qapModules.setupParams;
export const wasmDir = qapModules.wasmDir;
