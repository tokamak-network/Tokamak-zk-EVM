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

    // Function signature for approve(address,uint256): 0x095ea7b3
    // spender: 0x0ce8f6c9d4ad12e56e54018313761487d2d1fee9
    // amount: 2000 TON = 2000 * 10^18 = 2000000000000000000000
    const calldata =
      '0x095ea7b30000000000000000000000000ce8f6c9d4ad12e56e54018313761487d2d1fee90000000000000000000000000000000000000000000006c6b935b8bbd400000';
    const sender = new Address(
      hexToBytes('0xc2C30E79392A2D1a05288B172f205541a56FC20d'),
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
