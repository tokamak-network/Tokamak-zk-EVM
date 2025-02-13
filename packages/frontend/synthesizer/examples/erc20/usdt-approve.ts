/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx ton-transfer.ts
 */

import {  Address, hexToBytes } from "@ethereumjs/util/index.js"
import { keccak256 } from 'ethereum-cryptography/keccak'

import { createEVM } from '../../src/constructors.js'
import { finalize } from '../../src/tokamak/core/finalize.js'
import { setupEVMFromCalldata } from "src/tokamak/utils/evmSetup.js"
import USDT_STORAGE_LAYOUT from "../../constants/storage-layouts/USDT.json" assert { type: "json" };
import ERC20_CONTRACTS from "../../constants/bytecodes/ERC20_CONTRACTS.json" assert { type: "json" };

// USDT contract bytecode
const contractCode = ERC20_CONTRACTS.USDT

const main = async () => {
  
  const evm = await createEVM()

  //https://etherscan.io/tx/0x616341786dd998d18e1b44e34b20e8af59a487226d7691dd6b7e6a987dfc9e0a
  // 계정 설정
  const contractAddr = new Address(hexToBytes('0xdac17f958d2ee523a2206206994597c13d831ec7'))

  const calldata = "0x095ea7b3000000000000000000000000bc8552339da68eb65c8b88b414b5854e0e366cfc0000000000000000000000000000000000000000000000000000000000000009"
    
  const sender = new Address(hexToBytes('0x09D2598f7737015Ed85D5A5759221a6dc41072c5'))

  await setupEVMFromCalldata(evm, contractAddr, hexToBytes(contractCode), USDT_STORAGE_LAYOUT, calldata, sender)

  // Check specific spender's allowance
const allowanceSlot = '5';  // USDT allowance slot
const spender = "0xBC8552339dA68EB65C8b88B414B5854E0E366cFc";
  // Calculate sender's allowance position
const senderPosition = keccak256(
    hexToBytes(
        '0x' + sender.toString().slice(2).padStart(64, '0') + 
        allowanceSlot.padStart(64, '0'),
    ),
);
const specificSpenderKey = keccak256(
    hexToBytes(
        '0x' + spender.slice(2).padStart(64, '0') + 
        senderPosition.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '').padStart(64, '0'),
    ),
);
  
  const _specificAllowance = await evm.stateManager.getStorage(contractAddr, specificSpenderKey);
  
    console.log("Specific spender allowance:", Buffer.from(_specificAllowance).toString('hex'));

  const result = await evm.runCode({
    caller: sender,
    to: contractAddr,
    code: hexToBytes(contractCode),
    data: hexToBytes(calldata),
  })

//   console.log("result", result)
  
  // Check sender's allowance mapping
console.log("\n=== Checking sender's allowance ===");
console.log("Sender address:", sender.toString());
console.log("Sender's mapping position:", Buffer.from(senderPosition).toString('hex'));

// Get all allowances for this sender
// for(let i = 0; i < 6; i++) {  // Check first few potential spenders
//     const spenderKey = keccak256(
//         hexToBytes(
//             '0x' + '0'.repeat(i * 8).padStart(64, '0') + 
//             senderPosition.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '').padStart(64, '0'),
//         ),
//     );
//     const value = await evm.stateManager.getStorage(contractAddr, spenderKey);
//     console.log(`Allowance for spender ${i}:`, Buffer.from(value).toString('hex'));
// }


const specificAllowance = await evm.stateManager.getStorage(contractAddr, specificSpenderKey);
console.log("Specific spender allowance:", Buffer.from(specificAllowance).toString('hex'));
  
  // Generate proof
  const permutation = await finalize(result.runState!.synthesizer.placements, undefined, true)
}

void main().catch(e => {
  console.log("****ERROR****")
  console.error(e)
})
