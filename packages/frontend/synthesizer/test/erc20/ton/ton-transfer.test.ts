import { Address, hexToBytes } from '@synthesizer-libs/util';
import { describe, it, expect } from 'vitest';
import { createEVM } from '../../../src/constructors.js';
import { finalize } from '../../../src/tokamak/core/finalize.js';
import { setupEVMFromCalldata } from '../../../src/tokamak/utils/erc20EvmSetup.js';
import TON_STORAGE_LAYOUT from '../../../src/constants/storage-layouts/TON.json';
import TON from '../../../src/constants/bytecodes/TON.json';

describe('TON Token Approve', () => {
  // Contract bytecode
  const contractCode = TON.bytecode;

  it('should successfully approve TON tokens', async () => {
    const evm = await createEVM();

    // Setup accounts
    const contractAddr = new Address(
      hexToBytes('0x2be5e8c109e2197D077D13A82dAead6a9b3433C5'),
    );

    /**
     * https://etherscan.io/tx/0x4d6ed7a6777b94546f8e4f3e730cd15dd91c3913b930432a949a7253b0ba2981
     */
    const calldata =
      '0xa9059cbb000000000000000000000000d0ff1f431f55cd48f0ff469c579a1cceb45c7f1a0000000000000000000000000000000000000000000000acdc37d63ccd9ce18e';
    const sender = new Address(
      hexToBytes('0xF29f568F971C043Df7079A3121e9DE616b8998a3'),
    );

    // Setup EVM
    await setupEVMFromCalldata(
      evm,
      contractAddr,
      hexToBytes(contractCode),
      TON_STORAGE_LAYOUT,
      calldata,
      sender,
    );

    // Execute approve function
    const result = await evm.runCode({
      caller: sender,
      to: contractAddr,
      code: hexToBytes(contractCode),
      data: hexToBytes(calldata),
    });

    // Verification
    expect(result.exceptionError).toBeUndefined();

    // Check storage changes (optional)
    // Logic to check allowance mapping can be added here

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
