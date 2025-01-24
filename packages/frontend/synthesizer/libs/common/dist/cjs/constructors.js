"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCommonFromGethGenesis = exports.createCustomCommon = void 0;
const index_js_1 = require("./index.js");
/**
 * Creates a {@link Common} object for a custom chain, based on a standard one.
 *
 * It uses all the {@link Chain} parameters from the {@link baseChain} option except the ones overridden
 * in a provided {@link chainParamsOrName} dictionary. Some usage example:
 *
 * ```javascript
 * import { createCustomCommon, Mainnet } from '@ethereumjs/common'
 *
 * createCustomCommon({chainId: 123}, Mainnet)
 * ``
 *
 * @param partialConfig Custom parameter dict
 * @param baseChain `ChainConfig` chain configuration taken as a base chain, e.g. `Mainnet` (exported at root level)
 * @param opts Custom chain options to set various {@link BaseOpts}
 */
function createCustomCommon(partialConfig, baseChain, opts = {}) {
    return new index_js_1.Common({
        chain: {
            ...baseChain,
            ...partialConfig,
        },
        ...opts,
    });
}
exports.createCustomCommon = createCustomCommon;
/**
 * Static method to load and set common from a geth genesis JSON
 * @param genesisJSON JSON of geth configuration
 * @param  opts additional {@link GethConfigOpts} for configuring common
 * @returns Common
 */
function createCommonFromGethGenesis(genesisJSON, { chain, eips, genesisHash, hardfork, params, customCrypto }) {
    const genesisParams = (0, index_js_1.parseGethGenesis)(genesisJSON, chain);
    const common = new index_js_1.Common({
        chain: genesisParams,
        eips,
        params,
        hardfork: hardfork ?? genesisParams.hardfork,
        customCrypto,
    });
    if (genesisHash !== undefined) {
        common.setForkHashes(genesisHash);
    }
    return common;
}
exports.createCommonFromGethGenesis = createCommonFromGethGenesis;
//# sourceMappingURL=constructors.js.map