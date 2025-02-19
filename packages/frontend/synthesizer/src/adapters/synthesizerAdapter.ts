/**
 * The adapter provides an external interface that returns data structures directly in memory,
 * eliminating the need for file system operations.
 */
import { Address , hexToBytes} from "@synthesizer-libs/util";
import { EVM } from '../evm.js';
import { finalize } from '../tokamak/core/finalize.js';
import { setupEVMFromCalldata } from "../tokamak/utils/erc20EvmSetup.js";
import { setupUSDCFromCalldata } from "../tokamak/utils/usdcEvmSetup.js";
import { createEVM } from '../constructors.js';

import { SUPPORTED_TOKENS, TON_STORAGE_LAYOUT, USDT_STORAGE_LAYOUT, USDC_PROXY_STORAGE_LAYOUT, USDC_STORAGE_LAYOUT_V1, USDC_STORAGE_LAYOUT_V2 , TON_CONTRACT, USDT_CONTRACT, USDC_PROXY_CONTRACT, USDC_IMPLEMENTATION_V1, USDC_IMPLEMENTATION_V2} from "../constants/index.js";
import { PlacementInstances } from '../tokamak/types/synthesizer.js';
import { ExecResult } from '../types.js';

const TOKEN_CONFIGS = {
    TON: {
        address: SUPPORTED_TOKENS.TON,
        bytecode: TON_CONTRACT.bytecode,
        storageLayout: TON_STORAGE_LAYOUT,
        setupFunction: setupEVMFromCalldata 
    },
    USDT: {
        address: SUPPORTED_TOKENS.USDT,
        bytecode: USDT_CONTRACT.bytecode,
        storageLayout: USDT_STORAGE_LAYOUT,
        setupFunction: setupEVMFromCalldata 
    },
    USDC: {
        address: SUPPORTED_TOKENS.USDC_PROXY,
        proxyAddress: SUPPORTED_TOKENS.USDC_PROXY,
        implementationV1Address: SUPPORTED_TOKENS.USDC_IMPLEMENTATION_V1,
        implementationV2Address: SUPPORTED_TOKENS.USDC_IMPLEMENTATION_V2,
        bytecode: USDC_PROXY_CONTRACT.bytecode,
        implementationV1Bytecode: USDC_IMPLEMENTATION_V1.bytecode,
        implementationV2Bytecode: USDC_IMPLEMENTATION_V2.bytecode,
        storageLayout: USDC_PROXY_STORAGE_LAYOUT,
        storageLayoutV1: USDC_STORAGE_LAYOUT_V1,
        storageLayoutV2: USDC_STORAGE_LAYOUT_V2,
        setupFunction: setupUSDCFromCalldata 
    }
} as const;

export class SynthesizerAdapter {

    private isSupportedToken(address: string): boolean {
        return Object.values(SUPPORTED_TOKENS).includes(address.toLowerCase());
    }

    private getTokenConfig(address: string) {
        const config = Object.values(TOKEN_CONFIGS).find(
            config => config.address.toLowerCase() === address.toLowerCase()
        );
        
        if (!config) {
            throw new Error(
                `Unsupported token address: ${address}. ` +
                `Supported tokens are: ${Object.values(TOKEN_CONFIGS)
                    .map(c => c.address)
                    .join(', ')}`
            );
        }
        
        return config;
    }

      /**
     * Parses and processes an ERC20 transaction, returning all necessary data structures in memory.
     * @param {string} params.contractAddr - The ERC20 contract address
     * @param {string} params.calldata - The transaction calldata
     * @param {string} params.sender - The transaction sender address
     * @returns {Promise<{
     *   evm: EVM,
     *   executionResult: ExecResult,
     *   permutation: Permutation,
     *   placementInstance: PlacementInstances
     * }>} Returns EVM instance, execution result, permutation and placementInstance
     */
    public async parseTransaction({
        contractAddr,
        calldata,
        sender
    }: {
        contractAddr: string,
        calldata: string,
        sender: string
        }): Promise<{
            evm: EVM,
            executionResult: ExecResult,
            permutation: any,
            placementInstance: PlacementInstances
        }> {
       
        if (!this.isSupportedToken(contractAddr)) {
            throw new Error(`Unsupported token address: ${contractAddr}. Supported tokens are TON(Tokamak), USDT, and USDC.`);
        }
        const config = this.getTokenConfig(contractAddr);
        const evm = await createEVM();

        const _contractAddr = new Address(hexToBytes(config.address))
        const _sender = new Address(hexToBytes(sender))
        const _contractCode = hexToBytes(config.bytecode)
        const _calldata = hexToBytes(calldata)

        if (config === TOKEN_CONFIGS.USDC) {
            await  (config.setupFunction as typeof setupUSDCFromCalldata)(
                evm,
                _contractAddr,
                new Address(hexToBytes(config.implementationV1Address)),
                new Address(hexToBytes(config.implementationV2Address)),
                _contractCode,
                hexToBytes(config.implementationV1Bytecode),
                hexToBytes(config.implementationV2Bytecode),
                config.storageLayout,
                config.storageLayoutV1,
                config.storageLayoutV2,
                calldata,
                _sender
            );
        } else {
            await (config.setupFunction as typeof setupEVMFromCalldata)(
                evm,
                _contractAddr,
                _contractCode,
                config.storageLayout,
                calldata,
                _sender
            );
        }

        const executionResult = await evm.runCode({
            caller: _sender,
            to: _contractAddr,
            code: _contractCode,
            data: _calldata
        });

        const { permutation, placementInstance } = await finalize(
            executionResult.runState!.synthesizer.placements,
            undefined,
            true,
            false
        );

        return {
            evm,
            executionResult,
            permutation,
            placementInstance
        };
    }
}