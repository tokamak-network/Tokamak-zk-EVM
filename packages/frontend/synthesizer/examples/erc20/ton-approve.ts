/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx ton-transfer.ts
 */

import { Address, hexToBytes } from '@synthesizer-libs/util';
import { createEVM } from '../../src/constructors.js';
import { finalize } from '../../src/tokamak/core/finalize.js';
import { setupEVMFromCalldata } from '../../src/tokamak/utils/erc20EvmSetup.js';
import TON_STORAGE_LAYOUT from '../../src/constants/storage-layouts/TON.json' assert { type: 'json' };
import TON from '../../src/constants/bytecodes/TON.json' assert { type: 'json' };

// USDC contract bytecode
const contractCode = TON.bytecode;

const main = async () => {
  const evm = await createEVM();

  // 계정 설정
  const contractAddr = new Address(
    hexToBytes('0x2be5e8c109e2197D077D13A82dAead6a9b3433C5'),
  );

  // approve(address,uint256)의 함수 시그니처: 0x095ea7b3
  // spender: 0x0ce8f6c9d4ad12e56e54018313761487d2d1fee9 (예시와 동일한 주소 사용)
  // amount: 2000 TON = 2000 * 10^18 = 2000000000000000000000

  const calldata =
    '0x095ea7b30000000000000000000000000ce8f6c9d4ad12e56e54018313761487d2d1fee90000000000000000000000000000000000000000000006c6b935b8bbd400000';
  const sender = new Address(
    hexToBytes('0xc2C30E79392A2D1a05288B172f205541a56FC20d'),
  );

  await setupEVMFromCalldata(
    evm,
    contractAddr,
    hexToBytes(contractCode),
    TON_STORAGE_LAYOUT,
    calldata,
    sender,
  );

  // Now run the transfer
  const result = await evm.runCode({
    caller: sender,
    to: contractAddr,
    code: hexToBytes(contractCode),
    data: hexToBytes(calldata),
  });

  // Generate proof
  const permutation = await finalize(
    result.runState!.synthesizer.placements,
    undefined,
    false,
  );

  console.log('permutation', permutation);
};

void main();
