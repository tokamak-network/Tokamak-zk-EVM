import { Address, hexToBytes } from '@synthesizer-libs/util';
import { keccak256 } from 'ethereum-cryptography/keccak';
import { describe, it, expect } from 'vitest';
import { createEVM } from '../../../src/constructors.js';
import { finalize } from '../../../src/tokamak/core/finalize.js';
import { setupEVMFromCalldata } from '../../../src/tokamak/utils/erc20EvmSetup.js';
import USDT_STORAGE_LAYOUT from '../../../src/constants/storage-layouts/USDT.json';
import USDT_CONTRACT from '../../../src/constants/bytecodes/USDT.json';

describe('USDT Token Approve', () => {
  // Contract bytecode
  const contractCode = USDT_CONTRACT.bytecode;

  it('should successfully approve USDT tokens', async () => {
    const evm = await createEVM();

    // Source: https://etherscan.io/tx/0x616341786dd998d18e1b44e34b20e8af59a487226d7691dd6b7e6a987dfc9e0a
    // Setup accounts
    const contractAddr = new Address(
      hexToBytes('0xdac17f958d2ee523a2206206994597c13d831ec7'),
    );

    // Function signature for approve(address,uint256): 0x095ea7b3
    // spender: 0xbc8552339da68eb65c8b88b414b5854e0e366cfc
    // amount: 9 (USDT has 6 decimals)
    const calldata =
      '0x095ea7b3000000000000000000000000bc8552339da68eb65c8b88b414b5854e0e366cfc0000000000000000000000000000000000000000000000000000000000000009';
    const sender = new Address(
      hexToBytes('0x09D2598f7737015Ed85D5A5759221a6dc41072c5'),
    );
    const spender = '0xBC8552339dA68EB65C8b88B414B5854E0E366cFc';

    // Setup EVM
    await setupEVMFromCalldata(
      evm,
      contractAddr,
      hexToBytes(contractCode),
      USDT_STORAGE_LAYOUT,
      calldata,
      sender,
    );

    // Calculate storage slots for allowance
    const allowanceSlot = '5'; // USDT allowance slot

    // Calculate sender's allowance position
    const senderPosition = keccak256(
      hexToBytes(
        '0x' +
          sender.toString().slice(2).padStart(64, '0') +
          allowanceSlot.padStart(64, '0'),
      ),
    );

    // Calculate specific spender's key in the allowance mapping
    const specificSpenderKey = keccak256(
      hexToBytes(
        '0x' +
          spender.slice(2).padStart(64, '0') +
          senderPosition
            .reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '')
            .padStart(64, '0'),
      ),
    );

    // Check allowance before approval
    const allowanceBefore = await evm.stateManager.getStorage(
      contractAddr,
      specificSpenderKey,
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

    // Check allowance after approval
    const allowanceAfter = await evm.stateManager.getStorage(
      contractAddr,
      specificSpenderKey,
    );
    expect(allowanceAfter).toBeDefined();

    // Verify the allowance is set to the expected value
    const allowanceValue = Buffer.from(allowanceAfter).toString('hex');
    expect(parseInt(allowanceValue, 16)).toBe(9); // The approved amount is 9 from the calldata

    // If the initial allowance was different, we can verify it changed
    if (Buffer.from(allowanceBefore).toString('hex') !== allowanceValue) {
      expect(Buffer.from(allowanceBefore).toString('hex')).not.toBe(
        allowanceValue,
      );
    }

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
