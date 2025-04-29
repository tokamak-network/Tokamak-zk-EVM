import { Address, hexToBytes } from '@synthesizer-libs/util';
import { keccak256 } from 'ethereum-cryptography/keccak';
import { describe, it, expect } from 'vitest';
import { createEVM } from '../../../src/constructors.js';
import { finalize } from '../../../src/tokamak/core/finalize.js';
import { setupEVMFromCalldata } from '../../../src/tokamak/utils/erc20EvmSetup.js';
import USDT_STORAGE_LAYOUT from '../../../src/constants/storage-layouts/USDT.json';
import USDT_CONTRACT from '../../../src/constants/bytecodes/USDT.json';

describe('USDT Token Transfer', () => {
  // Contract bytecode
  const contractCode = USDT_CONTRACT.bytecode;

  it('should successfully transfer USDT tokens', async () => {
    const evm = await createEVM();

    // Setup accounts
    const contractAddr = new Address(
      hexToBytes('0xdac17f958d2ee523a2206206994597c13d831ec7'),
    );

    // Function signature for transfer(address,uint256): 0xa9059cbb
    // recipient: 0xaa71c32bff912e154f22e828d45e4217c7e168c3
    // amount: 0x6319d368 (1662687080 in decimal, with 6 decimals for USDT)
    const calldata =
      '0xa9059cbb000000000000000000000000aa71c32bff912e154f22e828d45e4217c7e168c3000000000000000000000000000000000000000000000000000000006319d368';
    const sender = new Address(
      hexToBytes('0x637Af44a6c0809e1D5Bd17ce22d763c1358f6127'),
    );
    const recipient = new Address(
      hexToBytes('0xaa71c32bff912e154f22e828d45e4217c7e168c3'),
    );

    // Setup EVM
    await setupEVMFromCalldata(
      evm,
      contractAddr,
      hexToBytes(contractCode),
      USDT_STORAGE_LAYOUT,
      calldata,
      sender,
    );

    // Calculate storage slots for balances
    const balanceSlot = '2'; // USDT balance slot

    // Calculate keys for sender and recipient balances
    const senderBalanceKey = keccak256(
      hexToBytes(
        '0x' +
          sender.toString().slice(2).padStart(64, '0') +
          balanceSlot.padStart(64, '0'),
      ),
    );

    const recipientBalanceKey = keccak256(
      hexToBytes(
        '0x' +
          recipient.toString().slice(2).padStart(64, '0') +
          balanceSlot.padStart(64, '0'),
      ),
    );

    // Check balances before transfer
    const senderBalanceBefore = await evm.stateManager.getStorage(
      contractAddr,
      senderBalanceKey,
    );
    const recipientBalanceBefore = await evm.stateManager.getStorage(
      contractAddr,
      recipientBalanceKey,
    );

    // Execute transfer function
    const result = await evm.runCode({
      caller: sender,
      to: contractAddr,
      code: hexToBytes(contractCode),
      data: hexToBytes(calldata),
    });

    // Verification
    expect(result.exceptionError).toBeUndefined();

    // Check balances after transfer
    const senderBalanceAfter = await evm.stateManager.getStorage(
      contractAddr,
      senderBalanceKey,
    );
    const recipientBalanceAfter = await evm.stateManager.getStorage(
      contractAddr,
      recipientBalanceKey,
    );

    // Balances should be defined
    expect(senderBalanceAfter).toBeDefined();
    expect(recipientBalanceAfter).toBeDefined();

    // If the transfer succeeded, the sender's balance should have decreased
    // and the recipient's balance should have increased
    if (senderBalanceBefore.length > 0 && senderBalanceAfter.length > 0) {
      const senderBalanceBeforeValue = BigInt(
        '0x' + Buffer.from(senderBalanceBefore).toString('hex'),
      );
      const senderBalanceAfterValue = BigInt(
        '0x' + Buffer.from(senderBalanceAfter).toString('hex'),
      );
      expect(senderBalanceAfterValue).toBeLessThan(senderBalanceBeforeValue);
    }

    if (recipientBalanceBefore.length > 0 && recipientBalanceAfter.length > 0) {
      const recipientBalanceBeforeValue = BigInt(
        '0x' + Buffer.from(recipientBalanceBefore).toString('hex'),
      );
      const recipientBalanceAfterValue = BigInt(
        '0x' + Buffer.from(recipientBalanceAfter).toString('hex'),
      );
      expect(recipientBalanceAfterValue).toBeGreaterThan(
        recipientBalanceBeforeValue,
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
