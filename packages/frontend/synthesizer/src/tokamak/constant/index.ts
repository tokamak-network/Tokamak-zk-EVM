// // For development
// import path from 'path';
// import { fileURLToPath } from 'url';
// import { pathToFileURL } from 'url';

// export * from './constants.js'

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // export * from './globalWireList.js'
// // export * from './subcircuitInfo.js'
// // export * from './setupParams.js'

// let modulePath = path.join(__dirname, '../../../../qap-compiler/subcircuits/library/subcircuitInfo.js');
// let moduleUrl = pathToFileURL(modulePath).href;
// const { subcircuits } = await import(moduleUrl);
// modulePath = path.join(__dirname, '../../../../qap-compiler/subcircuits/library/globalWireList.js');
// moduleUrl = pathToFileURL(modulePath).href;
// const { globalWireList } = await import(moduleUrl);
// modulePath = path.join(__dirname, '../../../../qap-compiler/subcircuits/library/setupParams.js');
// moduleUrl = pathToFileURL(modulePath).href;
// const { setupParams } = await import(moduleUrl);

// export {subcircuits, globalWireList, setupParams}

// // export const wasmDir = path.join(__dirname, '../constant/wasm')
// export const wasmDir = path.join(__dirname, '../../../../qap-compiler/subcircuits/library/wasm')

// For user interface
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

