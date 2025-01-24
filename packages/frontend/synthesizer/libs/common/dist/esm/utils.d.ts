type ConfigHardfork = {
    name: string;
    block: null;
    timestamp: number;
} | {
    name: string;
    block: number;
    timestamp?: number;
};
/**
 * Parses a genesis.json exported from Geth into parameters for Common instance
 * @param json representing the Geth genesis file
 * @param name optional chain name
 * @returns parsed params
 */
export declare function parseGethGenesis(json: any, name?: string): {
    name: string;
    chainId: number;
    depositContractAddress: `0x${string}`;
    genesis: {
        timestamp: `0x${string}`;
        gasLimit: `0x${string}`;
        difficulty: `0x${string}`;
        nonce: `0x${string}`;
        extraData: `0x${string}`;
        mixHash: `0x${string}`;
        coinbase: `0x${string}`;
        baseFeePerGas: `0x${string}`;
        excessBlobGas: `0x${string}`;
    };
    hardfork: string | undefined;
    hardforks: ConfigHardfork[];
    bootstrapNodes: never[];
    consensus: {
        type: string;
        algorithm: string;
        clique: {
            period: any;
            epoch: any;
        };
        ethash?: undefined;
    } | {
        type: string;
        algorithm: string;
        ethash: {};
        clique?: undefined;
    };
};
/**
 * Return the preset chain config for one of the predefined chain configurations
 * @param chain the representing a network name (e.g. 'mainnet') or number representing the chain ID
 * @returns a {@link ChainConfig}
 */
export declare const getPresetChainConfig: (chain: string | number) => import("./types.js").ChainConfig;
export {};
//# sourceMappingURL=utils.d.ts.map