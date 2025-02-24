import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export * from './globalWireList.js'
export * from './subcircuitInfo.js'

export const wasmDir = path.join(__dirname, '../constant/wasm');

