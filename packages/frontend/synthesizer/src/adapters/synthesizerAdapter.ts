import { Synthesizer } from '../tokamak/core/synthesizer.js';
import { Address , hexToBytes} from "@ethereumjs/util";
import { EVM } from 'src/evm.js';
import { finalize } from '../tokamak/core/finalize.js';
import { setupEVMFromCalldata } from "../tokamak/utils/erc20EvmSetup.js";
import { setupUSDCFromCalldata } from "../tokamak/utils/usdcEvmSetup.js";
import { createEVM } from '../constructors.js';
import SUPPORTED_TOKENS from "../../constants/addresses/ERC20_ADDRESSES.json" assert { type: "json" };
import TON_STORAGE_LAYOUT from "../../constants/storage-layouts/TON.json" assert { type: "json" };
import USDT_STORAGE_LAYOUT from "../../constants/storage-layouts/USDT.json" assert { type: "json" };
import USDC_PROXY_STORAGE_LAYOUT from "../../constants/storage-layouts/USDC_PROXY.json" assert { type: "json" };
import USDC_STORAGE_LAYOUT_V1 from "../../constants/storage-layouts/USDC_IMP.json" assert { type: "json" };
import USDC_STORAGE_LAYOUT_V2 from "../../constants/storage-layouts/USDC_IMP_2.json" assert { type: "json" };
import TON_CONTRACT from "../../constants/bytecodes/TON.json" assert { type: "json" };
import USDT_CONTRACT from "../../constants/bytecodes/USDT.json" assert { type: "json" };
import USDC_PROXY_CONTRACT from "../../constants/bytecodes/USDC_PROXY.json" assert { type: "json" };
import USDC_IMPLEMENTATION_V1 from "../../constants/bytecodes/USDC_IMP.json" assert { type: "json" };
import USDC_IMPLEMENTATION_V2 from "../../constants/bytecodes/USDC_IMP_2.json" assert { type: "json" };    

// 지원하는 토큰 설정
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

    private instances: Synthesizer[] = [];

      /**
     * 주어진 컨트랙트 주소가 지원되는 토큰인지 확인합니다.
     */
    private isSupportedToken(address: string): boolean {
        return Object.values(SUPPORTED_TOKENS).includes(address.toLowerCase());
    }


    /**
     * 주어진 컨트랙트 주소에 대한 토큰 설정을 반환합니다.
     */
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
     * ERC20 트랜잭션을 실행하고 증명을 생성합니다.
     * @param params 트랜잭션 실행에 필요한 파라미터들
     * @returns EVM 인스턴스, 실행 결과, 그리고 증명
     */
    async parseTransaction({
        contractAddr,
        calldata,
        sender
    }: {
        contractAddr: string,
        calldata: string,
        sender: string
        }) {
       
        if (!this.isSupportedToken(contractAddr)) {
            throw new Error(`Unsupported token address: ${contractAddr}. Supported tokens are TON(Tokamak), USDT, and USDC.`);
        }
        // 토큰 설정 가져오기
        const config = this.getTokenConfig(contractAddr);
        
        // 1. EVM 생성
        const evm = await createEVM();

        const _contractAddr = new Address(hexToBytes(config.address))
        const _sender = new Address(hexToBytes(sender))
        const _contractCode = hexToBytes(config.bytecode)
        const _calldata = hexToBytes(calldata)

        // USDC와 다른 토큰들의 설정 분기
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

        // 3. 트랜잭션 실행
        const result = await evm.runCode({
            caller: _sender,
            to: _contractAddr,
            code: _contractCode,
            data: _calldata
        });

        // 4. Finalize 및 증명 생성
        const { permutation, placementInstance } = await finalize(
            result.runState!.synthesizer.placements,
            undefined,
            true
        );

        return {
            evm,
            permutation,
            placementInstance
        };
    }
}