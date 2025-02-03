// export * from '../../../../qap-compiler/subcircuits/library/subcircuitInfo.js'
// export * from '../../../../qap-compiler/subcircuits/library/globalWireList.js'

import { createRequire } from "module";
const require = createRequire(import.meta.url);

export const subcircuits = require('../../../../qap-compiler/subcircuits/library/subcircuitInfo.js');
export const globalWireInfo = require('../../../../qap-compiler/subcircuits/library/globalWireList.js');
export const builder = require('../../../../qap-compiler/subcircuits/library/witness_calculator.js');

export const wasmDir = '../qap-compiler/subcircuits/library/wasm'