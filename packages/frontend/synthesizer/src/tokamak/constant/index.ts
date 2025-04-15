import path from 'path';
import { fileURLToPath } from 'url';
export * from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export {
  subcircuits,
  globalWireList,
  setupParams,
} from '@tokamak-zk-evm/qap-compiler';
export const wasmDir = path.join(
  __dirname,
  '../../../node_modules/@tokamak-zk-evm/qap-compiler/dist/wasm',
);
