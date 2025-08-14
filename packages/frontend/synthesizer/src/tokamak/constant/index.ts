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
const [subcircuits, globalWireList, setupParams] = await Promise.all([
  importQapModule(`${BASE_PATH}/subcircuitInfo.js`, 'subcircuits'),
  importQapModule(`${BASE_PATH}/globalWireList.js`, 'globalWireList'),
  importQapModule(`${BASE_PATH}/setupParams.js`, 'setupParams'),
]);

export { subcircuits, globalWireList, setupParams };

// WASM directory path
export const wasmDir = path.join(__dirname, BASE_PATH, 'wasm');