import * as subcircuitsModule from '../../../../qap-compiler/subcircuits/library/subcircuitInfo.js';
export const subcircuits = subcircuitsModule.default || subcircuitsModule;
import * as globalWireInfoModule from '../../../../qap-compiler/subcircuits/library/globalWireList.js';
export const globalWireInfo = globalWireInfoModule.default || globalWireInfoModule;
import * as witnessCalculatorModule from '../../../../qap-compiler/subcircuits/library/witness_calculator.js';
export const builder = witnessCalculatorModule.default || witnessCalculatorModule;


export const wasmDir = '../qap-compiler/subcircuits/library/wasm'


