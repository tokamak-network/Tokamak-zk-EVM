/**
 * The adapter provides an external interface that returns data structures directly in memory,
 * eliminating the need for file system operations.
 */
import { Address, hexToBytes } from '@synthesizer-libs/util';
import { EVM } from '../evm.js';
import { finalize } from '../tokamak/core/finalize.js';
import { setupEVMFromCalldata } from '../tokamak/utils/erc20EvmSetup.js';
import { setupUSDCFromCalldata } from '../tokamak/utils/usdcEvmSetup.js';
import { createEVM } from '../constructors.js';

import {
  SUPPORTED_TOKENS,
  TON_STORAGE_LAYOUT,
  USDT_STORAGE_LAYOUT,
  USDC_PROXY_STORAGE_LAYOUT,
  USDC_STORAGE_LAYOUT_V1,
  USDC_STORAGE_LAYOUT_V2,
  TON_CONTRACT,
  USDT_CONTRACT,
  USDC_PROXY_CONTRACT,
  USDC_IMPLEMENTATION_V1,
  USDC_IMPLEMENTATION_V2,
} from '../constants/index.js';
import { PlacementInstances } from '../tokamak/types/synthesizer.js';
import { ExecResult } from '../types.js';

import {
  STORAGE_IN_PLACEMENT_INDEX,
  RETURN_PLACEMENT_INDEX,
  STORAGE_OUT_PLACEMENT_INDEX,
} from '../tokamak/constant/constants.js';

const TOKEN_CONFIGS = {
  TON: {
    address: SUPPORTED_TOKENS.TON,
    bytecode: TON_CONTRACT.bytecode,
    storageLayout: TON_STORAGE_LAYOUT,
    setupFunction: setupEVMFromCalldata,
  },
  USDT: {
    address: SUPPORTED_TOKENS.USDT,
    bytecode: USDT_CONTRACT.bytecode,
    storageLayout: USDT_STORAGE_LAYOUT,
    setupFunction: setupEVMFromCalldata,
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
    setupFunction: setupUSDCFromCalldata,
  },
} as const;

export class SynthesizerAdapter {
  private evm: Promise<EVM> | EVM;

  constructor() {
    // Initialize EVM in constructor
    this.evm = this.createFreshEVM();
  }

  private isSupportedToken(address: string): boolean {
    return Object.values(SUPPORTED_TOKENS).includes(address.toLowerCase());
  }

  private isTON(address: string): boolean {
    return address.toLowerCase() === SUPPORTED_TOKENS.TON.toLowerCase();
  }

  private getTokenConfig(address: string) {
    const config = Object.values(TOKEN_CONFIGS).find(
      (config) => config.address.toLowerCase() === address.toLowerCase(),
    );

    if (!config) {
      throw new Error(
        `Unsupported token address: ${address}. ` +
          `Supported tokens are: ${Object.values(TOKEN_CONFIGS)
            .map((c) => c.address)
            .join(', ')}`,
      );
    }

    return config;
  }

  // 새로운 메소드 추가
  private isUnsupportedMethod(contractAddr: string, calldata: string): boolean {
    if (
      this.isTON(contractAddr) &&
      calldata.slice(0, 10).toLowerCase() === '0xcae9ca51'
    ) {
      return true;
    }

    return false;
  }

  public get placementIndices(): {
    storageIn: number;
    return: number;
    storageOut: number;
  } {
    return {
      storageIn: STORAGE_IN_PLACEMENT_INDEX,
      return: RETURN_PLACEMENT_INDEX,
      storageOut: STORAGE_OUT_PLACEMENT_INDEX,
    };
  }

  private async createFreshEVM(): Promise<EVM> {
    const evm = await createEVM();

    // Initialize placements inPts and outPts arrays
    if (evm.synthesizer) {
      evm.synthesizer.logPt = [];

      const returnPlacement = evm.synthesizer.placements.get(
        RETURN_PLACEMENT_INDEX,
      );
      if (returnPlacement) {
        returnPlacement.inPts = [];
        returnPlacement.outPts = [];
        console.log(
          'SynthesizerAdapter.parseTransaction: Cleared logPt and outPts arrays',
        );
      }
      // Initialize STORAGE_IN_PLACEMENT's inPts and outPts arrays
      const storageInPlacement = evm.synthesizer.placements.get(
        STORAGE_IN_PLACEMENT_INDEX,
      );
      if (storageInPlacement) {
        storageInPlacement.inPts = [];
        storageInPlacement.outPts = [];
        console.log(
          'SynthesizerAdapter.parseTransaction: Cleared STORAGE_IN_PLACEMENT arrays',
        );
      }

      // Initialize STORAGE_OUT_PLACEMENT's inPts and outPts arrays
      const storageOutPlacement = evm.synthesizer.placements.get(
        STORAGE_OUT_PLACEMENT_INDEX,
      );
      if (storageOutPlacement) {
        storageOutPlacement.inPts = [];
        storageOutPlacement.outPts = [];
        console.log(
          'SynthesizerAdapter.parseTransaction: Cleared STORAGE_OUT_PLACEMENT arrays',
        );
      }
    }

    return evm;
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
    sender,
  }: {
    contractAddr: string;
    calldata: string;
    sender: string;
  }): Promise<{
    evm: EVM;
    executionResult: ExecResult;
    permutation: any;
    placementInstance: PlacementInstances;
  }> {
    if (!this.isSupportedToken(contractAddr)) {
      throw new Error(
        `Unsupported token address: ${contractAddr}. Supported tokens are TON(Tokamak), USDT, and USDC.`,
      );
    }

    if (this.isUnsupportedMethod(contractAddr, calldata)) {
      throw new Error(`Unsupported method for this token.`);
    }

    const config = this.getTokenConfig(contractAddr);

    // 생성자에서 초기화된 EVM 사용
    const evm = await this.evm;

    const _contractAddr = new Address(hexToBytes(config.address));
    const _sender = new Address(hexToBytes(sender));
    const _contractCode = hexToBytes(config.bytecode);
    const _calldata = hexToBytes(calldata);

    if (config === TOKEN_CONFIGS.USDC) {
      await (config.setupFunction as typeof setupUSDCFromCalldata)(
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
        _sender,
      );
    } else {
      await (config.setupFunction as typeof setupEVMFromCalldata)(
        evm,
        _contractAddr,
        _contractCode,
        config.storageLayout,
        calldata,
        _sender,
      );
    }

    const executionResult = await evm.runCode({
      caller: _sender,
      to: _contractAddr,
      code: _contractCode,
      data: _calldata,
    });

    // validate 옵션을 false로 설정하여 testInstances 함수를 건너뜁니다
    const { permutation, placementInstance } = await finalize(
      executionResult.runState!.synthesizer.placements,
      undefined,
      false, // validate를 false로 변경
      false,
    );

    return {
      evm,
      executionResult,
      permutation,
      placementInstance,
    };
  }
}
