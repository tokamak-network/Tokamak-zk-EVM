"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupEOF = void 0;
const container_js_1 = require("./container.js");
/**
 * Setup EOF by preparing the `RunState` to run EVM in EOF mode
 * @param runState Current run state
 * @param eofMode EOF mode to run in (only changes in case of EOFCREATE)
 */
function setupEOF(runState, eofMode = container_js_1.EOFContainerMode.Default) {
    runState.env.eof = {
        container: new container_js_1.EOFContainer(runState.code, eofMode),
        eofRunState: {
            returnStack: [], // Return stack for RETF/CALLF/JUMPF
        },
    };
    // In case that txCallData is set, set the `callData` of `env` to this calldata
    // This ensures that CALLDATA can be read when deploying EOF contracts using txs
    if (runState.env.eof.container.body.txCallData !== undefined) {
        runState.env.callData = runState.env.eof.container.body.txCallData;
    }
    // Set program counter to the first code section
    const pc = runState.env.eof.container.header.getCodePosition(0);
    runState.programCounter = pc;
}
exports.setupEOF = setupEOF;
//# sourceMappingURL=setup.js.map