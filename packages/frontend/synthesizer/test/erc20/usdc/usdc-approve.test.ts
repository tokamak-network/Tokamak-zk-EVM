import { Address, hexToBytes } from '@synthesizer-libs/util';
import { keccak256 } from 'ethereum-cryptography/keccak';
import { describe, it, expect } from 'vitest';
import { createEVM } from '../../../src/constructors.js';
import { finalize } from '../../../src/tokamak/core/finalize.js';
import { setupUSDCFromCalldata } from '../../../src/tokamak/utils/usdcEvmSetup.js';
import USDC_PROXY_CONTRACT from '../../../src/constants/bytecodes/USDC_PROXY.json';
import USDC_STORAGE_LAYOUT from '../../../src/constants/storage-layouts/USDC_PROXY.json';
import USDC_STORAGE_LAYOUT_V1 from '../../../src/constants/storage-layouts/USDC_IMP.json';
import USDC_STORAGE_LAYOUT_V2 from '../../../src/constants/storage-layouts/USDC_IMP_2.json';
import USDC_IMPLEMENTATION_V1 from '../../../src/constants/bytecodes/USDC_IMP.json';
import USDC_IMPLEMENTATION_V2 from '../../../src/constants/bytecodes/USDC_IMP_2.json';

// Helper function to parse Approval events
const parseApprovalEvent = (logs: any[]) => {
  // Approval event: event Approval(address indexed owner, address indexed spender, uint256 value)
  for (const log of logs) {
    try {
      // log[0] is contract address
      // log[1] is topics array
      // log[2] is data
      const [contractAddress, topics, data] = log;

      // topics[0] is the event signature hash
      // Approval(address,address,uint256) => 0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925
      const eventSignature = Buffer.from(topics[0]).toString('hex');
      if (
        eventSignature ===
        '8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925'
      ) {
        const owner = '0x' + Buffer.from(topics[1]).toString('hex');
        const spender = '0x' + Buffer.from(topics[2]).toString('hex');
        const value = BigInt('0x' + Buffer.from(data).toString('hex'));

        return {
          contractAddress: '0x' + Buffer.from(contractAddress).toString('hex'),
          event: 'Approval',
          owner,
          spender,
          value: value.toString(),
        };
      }
    } catch (error) {
      console.error('Error parsing log:', error);
      console.log('Problematic log:', log);
    }
  }
  return null;
};

describe('USDC Token Approve', () => {
  // Contract bytecode
  const contractCode = USDC_PROXY_CONTRACT.bytecode;

  it('should successfully approve USDC tokens', async () => {
    const evm = await createEVM();

    // Setup contract addresses
    const proxyAddr = new Address(
      hexToBytes('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'),
    ); // USDC proxy
    const implementationV1Addr = new Address(
      hexToBytes('0x43506849d7c04f9138d1a2050bbf3a0c054402dd'),
    ); // v1
    const implementationV2Addr = new Address(
      hexToBytes('0x800c32eaa2a6c93cf4cb51794450ed77fbfbb172'),
    ); // v2

    /**
     * Source: https://etherscan.io/tx/0xd2e02df1a4e29d14a7ee34c475580d55a932ab5c2b81a7046743a776d449b6b4
     */
    const spender = '0x334841090107D86523bd7cc6DA8279dc02aAE9e9';
    const amount = '95192259'; // (6 decimals)
    const calldata =
      '0x095ea7b30000000000000000000000001111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000005ac84c3';
    const sender = new Address(
      hexToBytes('0x334841090107D86523bd7cc6DA8279dc02aAE9e9'),
    );
    const approvedSpender = '0x1111111254eeb25477b68fb85ed929f73a960582'; // From calldata

    // Setup EVM with USDC proxy and implementation contracts
    await setupUSDCFromCalldata(
      evm,
      proxyAddr,
      implementationV1Addr,
      implementationV2Addr,
      hexToBytes(contractCode),
      hexToBytes(USDC_IMPLEMENTATION_V1.bytecode),
      hexToBytes(USDC_IMPLEMENTATION_V2.bytecode),
      USDC_STORAGE_LAYOUT,
      USDC_STORAGE_LAYOUT_V1,
      USDC_STORAGE_LAYOUT_V2,
      calldata,
      sender,
    );

    // Compute allowance storage slot
    const allowanceSlot = '10'; // USDC allowance slot
    const ownerKey = keccak256(
      hexToBytes(
        '0x' +
          sender.toString().slice(2).padStart(64, '0') +
          allowanceSlot.padStart(64, '0'),
      ),
    );
    const spenderKey = keccak256(
      hexToBytes(
        '0x' +
          approvedSpender.slice(2).padStart(64, '0') +
          ownerKey
            .reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '')
            .padStart(64, '0'),
      ),
    );

    // Check allowance before approval (optional)
    const allowanceBefore = await evm.stateManager.getStorage(
      proxyAddr,
      spenderKey,
    );

    // Execute approve function
    const result = await evm.runCode({
      caller: sender,
      to: proxyAddr,
      code: hexToBytes(contractCode),
      data: hexToBytes(calldata),
    });

    // Verification
    expect(result.exceptionError).toBeUndefined();

    // Check allowance after approval
    // const allowanceAfter = await evm.stateManager.getStorage(
    //   proxyAddr,
    //   spenderKey,
    // );
    // expect(allowanceAfter).toBeDefined();

    // // If we want to check the exact value of the allowance:
    // if (allowanceAfter.length > 0) {
    //   const allowanceAfterDecimal = BigInt(
    //     '0x' + Buffer.from(allowanceAfter).toString('hex'),
    //   );
    //   expect(allowanceAfterDecimal.toString()).not.toBe('0');
    //   // Optionally check for the expected amount: 0x05ac84c3 = 95192259
    //   // expect(allowanceAfterDecimal.toString()).toBe('95192259');
    // }

    // Verify event was emitted
    // if (result.logs && result.logs.length > 0) {
    //   const approvalEvent = parseApprovalEvent(result.logs);
    //   expect(approvalEvent).not.toBeNull();
    //   if (approvalEvent) {
    //     expect(approvalEvent.event).toBe('Approval');
    //     expect(approvalEvent.owner.toLowerCase()).toBe(
    //       sender.toString().toLowerCase(),
    //     );
    //     expect(approvalEvent.spender.toLowerCase()).toBe(
    //       approvedSpender.toLowerCase(),
    //     );
    //     expect(approvalEvent.value).toBe('95192259');
    //   }
    // }

    // Verify Synthesizer worked correctly
    expect(result.runState).toBeDefined();
    expect(result.runState?.synthesizer.placements).toBeDefined();

    // Generate permutation (optional)
    // This may take time in tests, activate as needed
    const permutation = await finalize(
      result.runState!.synthesizer.placements,
      undefined,
      false,
    );
    expect(permutation).toBeDefined();
  });
});
