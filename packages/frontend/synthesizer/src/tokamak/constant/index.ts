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

let subcircuits: any;
let globalWireList: any;
let setupParams: any;

async function loadQapModules() {
  if (!subcircuits) {
    const [s, g, p] = await Promise.all([
      importQapModule(`${BASE_PATH}/subcircuitInfo.js`, 'subcircuits'),
      importQapModule(`${BASE_PATH}/globalWireList.js`, 'globalWireList'),
      importQapModule(`${BASE_PATH}/setupParams.js`, 'setupParams'),
    ]);
    subcircuits = s;
    globalWireList = g;
    setupParams = p;
  }
  return { subcircuits, globalWireList, setupParams };
}

// Use static imports for binary compilation
export {
  subcircuits,
  globalWireList,
  setupParams,
  wasmDir,
} from './qap-static.js';

// WASM directory path - now exported from qap-static.js
