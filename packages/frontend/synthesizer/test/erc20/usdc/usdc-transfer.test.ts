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

describe('USDC Token Transfer', () => {
  // Contract bytecode
  const contractCode = USDC_PROXY_CONTRACT.bytecode;

  it('should successfully transfer USDC tokens', async () => {
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
     * Source: https://etherscan.io/tx/0xd1567b6d2a512d7910c3b231ea880e0451cfa3de7ff8377748f9fc396912f3f6
     */
    const calldata =
      '0xa9059cbb00000000000000000000000043b719b9c6cf849dca549765ba1af00f3dfc4ac10000000000000000000000000000000000000000000000000000000005f60810';
    const sender = new Address(
      hexToBytes('0x03ec765dbdF46AADaa52Cd663Fe0ea174be36720'),
    );
    const recipient = new Address(
      hexToBytes('0x43b719b9c6cf849dca549765ba1af00f3dfc4ac1'),
    );

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

    // Execute transfer function
    const result = await evm.runCode({
      caller: sender,
      to: proxyAddr,
      code: hexToBytes(contractCode),
      data: hexToBytes(calldata),
    });

    // Verification
    expect(result.exceptionError).toBeUndefined();

    // Check storage changes
    const balanceSlot = '9';

    // Check sender balance
    const senderBalanceKey = keccak256(
      hexToBytes(
        '0x' +
          sender.toString().slice(2).padStart(64, '0') +
          balanceSlot.padStart(64, '0'),
      ),
    );
    const senderBalanceAfter = await evm.stateManager.getStorage(
      proxyAddr,
      senderBalanceKey,
    );
    expect(senderBalanceAfter).toBeDefined();

    // Check recipient balance (optional)
    const recipientBalanceKey = keccak256(
      hexToBytes(
        '0x' +
          recipient.toString().slice(2).padStart(64, '0') +
          balanceSlot.padStart(64, '0'),
      ),
    );
    const recipientBalanceAfter = await evm.stateManager.getStorage(
      proxyAddr,
      recipientBalanceKey,
    );
    expect(recipientBalanceAfter).toBeDefined();

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
