import { Address, hexToBytes } from '@synthesizer-libs/util';
import { keccak256 } from 'ethereum-cryptography/keccak';
import { describe, it, expect } from 'vitest';
import { createEVM } from '../../../src/constructors.js';
import { finalize } from '../../../src/tokamak/core/finalize.js';
import { setupEVMFromCalldata } from '../../../src/tokamak/utils/erc20EvmSetup.js';
import USDT_STORAGE_LAYOUT from '../../../src/constants/storage-layouts/USDT.json';
import USDT_CONTRACT from '../../../src/constants/bytecodes/USDT.json';

describe('USDT Token TransferFrom', () => {
  // Contract bytecode
  const contractCode = USDT_CONTRACT.bytecode;

  it('should successfully execute transferFrom for USDT tokens', async () => {
    const evm = await createEVM();

    // Setup accounts
    const contractAddr = new Address(
      hexToBytes('0xdac17f958d2ee523a2206206994597c13d831ec7'),
    );

    // Function signature for transferFrom(address,address,uint256): 0x23b872dd
    // from: 0x80f340fcc2e2bccb71a8f92dad61659df3f4c835
    // to: 0x83c41363cbee0081dab75cb841fa24f3db46627e
    // amount: 0x036e77ef (57720815 in decimal, with 6 decimals for USDT)
    const calldata =
      '0x23b872dd00000000000000000000000080f340fcc2e2bccb71a8f92dad61659df3f4c83500000000000000000000000083c41363cbee0081dab75cb841fa24f3db46627e00000000000000000000000000000000000000000000000000000000036e77ef';
    const sender = new Address(
      hexToBytes('0xa152F8bb749c55E9943A3a0A3111D18ee2B3f94E'),
    );
    const fromAccount = new Address(
      hexToBytes('0x80f340fcc2e2bccb71a8f92dad61659df3f4c835'),
    );
    const toAccount = new Address(
      hexToBytes('0x83c41363cbee0081dab75cb841fa24f3db46627e'),
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

    // Calculate storage slots
    const balanceSlot = '2'; // USDT balance slot
    const allowanceSlot = '5'; // USDT allowance slot

    // Calculate balance keys
    const fromBalanceKey = keccak256(
      hexToBytes(
        '0x' +
          fromAccount.toString().slice(2).padStart(64, '0') +
          balanceSlot.padStart(64, '0'),
      ),
    );

    const toBalanceKey = keccak256(
      hexToBytes(
        '0x' +
          toAccount.toString().slice(2).padStart(64, '0') +
          balanceSlot.padStart(64, '0'),
      ),
    );

    // Calculate allowance key
    const fromAllowancePosition = keccak256(
      hexToBytes(
        '0x' +
          fromAccount.toString().slice(2).padStart(64, '0') +
          allowanceSlot.padStart(64, '0'),
      ),
    );

    const spenderAllowanceKey = keccak256(
      hexToBytes(
        '0x' +
          sender.toString().slice(2).padStart(64, '0') +
          fromAllowancePosition
            .reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '')
            .padStart(64, '0'),
      ),
    );

    // Check balances and allowance before transferFrom
    const fromBalanceBefore = await evm.stateManager.getStorage(
      contractAddr,
      fromBalanceKey,
    );
    const toBalanceBefore = await evm.stateManager.getStorage(
      contractAddr,
      toBalanceKey,
    );
    const allowanceBefore = await evm.stateManager.getStorage(
      contractAddr,
      spenderAllowanceKey,
    );

    // Execute transferFrom function
    const result = await evm.runCode({
      caller: sender,
      to: contractAddr,
      code: hexToBytes(contractCode),
      data: hexToBytes(calldata),
    });

    // Verification
    expect(result.exceptionError).toBeUndefined();

    // Check balances and allowance after transferFrom
    const fromBalanceAfter = await evm.stateManager.getStorage(
      contractAddr,
      fromBalanceKey,
    );
    const toBalanceAfter = await evm.stateManager.getStorage(
      contractAddr,
      toBalanceKey,
    );
    const allowanceAfter = await evm.stateManager.getStorage(
      contractAddr,
      spenderAllowanceKey,
    );

    // Balances and allowance should be defined
    expect(fromBalanceAfter).toBeDefined();
    expect(toBalanceAfter).toBeDefined();
    expect(allowanceAfter).toBeDefined();

    // If the transferFrom succeeded:
    // 1. The 'from' account's balance should have decreased
    if (fromBalanceBefore.length > 0 && fromBalanceAfter.length > 0) {
      const fromBalanceBeforeValue = BigInt(
        '0x' + Buffer.from(fromBalanceBefore).toString('hex'),
      );
      const fromBalanceAfterValue = BigInt(
        '0x' + Buffer.from(fromBalanceAfter).toString('hex'),
      );
      expect(fromBalanceAfterValue).toBeLessThan(fromBalanceBeforeValue);
    }

    // 2. The 'to' account's balance should have increased
    if (toBalanceBefore.length > 0 && toBalanceAfter.length > 0) {
      const toBalanceBeforeValue = BigInt(
        '0x' + Buffer.from(toBalanceBefore).toString('hex'),
      );
      const toBalanceAfterValue = BigInt(
        '0x' + Buffer.from(toBalanceAfter).toString('hex'),
      );
      expect(toBalanceAfterValue).toBeGreaterThan(toBalanceBeforeValue);
    }

    // 3. The sender's allowance should have decreased
    if (allowanceBefore.length > 0 && allowanceAfter.length > 0) {
      const allowanceBeforeValue = BigInt(
        '0x' + Buffer.from(allowanceBefore).toString('hex'),
      );
      const allowanceAfterValue = BigInt(
        '0x' + Buffer.from(allowanceAfter).toString('hex'),
      );
      expect(allowanceAfterValue).toBeLessThan(allowanceBeforeValue);
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
