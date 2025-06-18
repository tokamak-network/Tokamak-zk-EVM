import path from 'path';
import { fileURLToPath } from 'url';
import { subcircuits } from '@qap-compiler/library/subcircuitInfo.js';
import { globalWireList } from '@qap-compiler/library/globalWireList.js';
import { setupParams } from '@qap-compiler/library/setupParams.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const wasmDir = path.join(
  __dirname,
  '../../../../qap-compiler/subcircuits/library/wasm',
);

export * from './circuits.js';
export * from './common.js';
export * from './placements.js';
export * from './arithmetic.js';

export { subcircuits, globalWireList, setupParams, wasmDir };

// // For user interface
// import path from 'path';
// import { fileURLToPath } from 'url';
// export * from './constants.js';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// export {
//   subcircuits,
//   globalWireList,
//   setupParams,
// } from '@tokamak-zk-evm/qap-compiler';
// export const wasmDir = path.join(
//   __dirname,
//   '../../../node_modules/@tokamak-zk-evm/qap-compiler/dist/wasm',
// );
