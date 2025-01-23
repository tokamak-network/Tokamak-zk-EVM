"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEVM = void 0;
const index_js_1 = require("@ethereumjs/common/dist/esm/index.js");
const index_js_2 = require("@ethereumjs/statemanager/index.js");
const index_js_3 = require("./precompiles/index.js");
const types_js_1 = require("./types.js");
const index_js_4 = require("./index.js");
/**
 * Use this async static constructor for the initialization
 * of an EVM object
 *
 * @param createOpts The EVM options
 * @returns A new EVM
 */
async function createEVM(createOpts) {
    const opts = createOpts ?? {};
    opts.bn254 = new index_js_3.NobleBN254();
    if (opts.common === undefined) {
        opts.common = new index_js_1.Common({ chain: index_js_1.Mainnet });
    }
    if (opts.blockchain === undefined) {
        opts.blockchain = new types_js_1.EVMMockBlockchain();
    }
    if (opts.stateManager === undefined) {
        opts.stateManager = new index_js_2.SimpleStateManager();
    }
    return new index_js_4.EVM(opts);
}
exports.createEVM = createEVM;
//# sourceMappingURL=constructors.js.map