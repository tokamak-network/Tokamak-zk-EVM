import path from 'path';
import { fileURLToPath } from 'url';
import { subcircuits } from '../../../../qap-compiler/subcircuits/library/subcircuitInfo.js';
import { globalWireList } from '../../../../qap-compiler/subcircuits/library/globalWireList.js';
import { setupParams } from '../../../../qap-compiler/subcircuits/library/setupParams.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const wasmDir = path.join(
  __dirname,
  '../../../../qap-compiler/subcircuits/library/wasm',
);

export { subcircuits, globalWireList, setupParams, wasmDir };
export * from './constants.js';
