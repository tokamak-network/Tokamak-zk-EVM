<<<<<<< HEAD
import { byteSize } from './../../src/tokamak/utils/utils';
/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx ton-transfer.ts
 */

import { Account, Address, hexToBytes } from "@ethereumjs/util/index.js"
import { keccak256 } from 'ethereum-cryptography/keccak'

import { createEVM } from '../../src/constructors.js'
import { finalize } from '../../src/tokamak/core/finalize.js'
import { setupEVMFromCalldata } from "src/tokamak/utils/erc20EvmSetup.js"
import USDT_STORAGE_LAYOUT from "../../constants/storage-layouts/USDT.json" assert { type: "json" };
import USDT_CONTRACT from "../../constants/bytecodes/USDT.json" assert { type: "json" };

// USDT contract bytecode
const contractCode = USDT_CONTRACT.bytecode

const main = async () => {
  const evm = await createEVM()

  // 계정 설정
  const contractAddr = new Address(hexToBytes('0xdac17f958d2ee523a2206206994597c13d831ec7'))

  const calldata = "0xa9059cbb000000000000000000000000aa71c32bff912e154f22e828d45e4217c7e168c3000000000000000000000000000000000000000000000000000000006319d368"
  const sender = new Address(hexToBytes('0x637Af44a6c0809e1D5Bd17ce22d763c1358f6127'))

  await setupEVMFromCalldata(evm, contractAddr, hexToBytes(contractCode), USDT_STORAGE_LAYOUT, calldata, sender)

  // Now run the transfer
  const result = await evm.runCode({
    caller: sender,
    to: contractAddr,
    code: hexToBytes(contractCode),
    data: hexToBytes(
     calldata
    ),
  })
  
  // Generate proof
  const permutation = await finalize(result.runState!.synthesizer.placements, undefined, true)
}

void main()
=======
import { byteSize } from './../../src/tokamak/utils/utils';
/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx ton-transfer.ts
 */

import { Account, Address, hexToBytes } from "@synthesizer-libs/util"
import { keccak256 } from 'ethereum-cryptography/keccak'

import { createEVM } from '../../src/constructors.js'
import { finalize } from '../../src/tokamak/core/finalize.js'
import { setupEVMFromCalldata } from "src/tokamak/utils/erc20EvmSetup.js"
import USDT_STORAGE_LAYOUT from "../../constants/storage-layouts/USDT.json" assert { type: "json" };
import USDT_CONTRACT from "../../constants/bytecodes/USDT.json" assert { type: "json" };

// USDT contract bytecode
const contractCode = USDT_CONTRACT.bytecode

const main = async () => {
  const evm = await createEVM()

  // 계정 설정
  const contractAddr = new Address(hexToBytes('0xdac17f958d2ee523a2206206994597c13d831ec7'))

  const calldata = "0xa9059cbb000000000000000000000000aa71c32bff912e154f22e828d45e4217c7e168c3000000000000000000000000000000000000000000000000000000006319d368"
  const sender = new Address(hexToBytes('0x637Af44a6c0809e1D5Bd17ce22d763c1358f6127'))

  await setupEVMFromCalldata(evm, contractAddr, hexToBytes(contractCode), USDT_STORAGE_LAYOUT, calldata, sender)

  // Now run the transfer
  const result = await evm.runCode({
    caller: sender,
    to: contractAddr,
    code: hexToBytes(contractCode),
    data: hexToBytes(
     calldata
    ),
  })
  
  // Generate proof
  const permutation = await finalize(result.runState!.synthesizer.placements, undefined, true)
}

void main()
>>>>>>> 603bf51d9e02a58183fabb7f7fd08e9580ceef44
