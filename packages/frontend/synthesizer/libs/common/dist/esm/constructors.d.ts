import { Common } from './index.js';
import type { BaseOpts, ChainConfig, GethConfigOpts } from './index.js';
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
export declare function createCustomCommon(partialConfig: Partial<ChainConfig>, baseChain: ChainConfig, opts?: BaseOpts): Common;
/**
 * Static method to load and set common from a geth genesis JSON
 * @param genesisJSON JSON of geth configuration
 * @param  opts additional {@link GethConfigOpts} for configuring common
 * @returns Common
 */
export declare function createCommonFromGethGenesis(genesisJSON: any, { chain, eips, genesisHash, hardfork, params, customCrypto }: GethConfigOpts): Common;
//# sourceMappingURL=constructors.d.ts.map