import {  Address, hexToBytes } from '@synthesizer-libs/util';
import { keccak256 } from 'ethereum-cryptography/keccak'
import { EVM } from '../evm.js';

export async function logAfterTransaction({
    evm,
    sender,
    balanceSlot,
    contractAddr
}: {
    evm: EVM,
    sender: Address,
    balanceSlot: string,
    contractAddr: Address
}) {
  console.log("\n=== After Transfer ===");
  const senderBalanceKey = keccak256(
    hexToBytes(
        '0x' + sender.toString().slice(2).padStart(64, '0') + 
        balanceSlot.padStart(64, '0')
    )
);

  const balanceAfter = await evm.stateManager.getStorage(contractAddr, senderBalanceKey);
console.log("Sender balance after:", Buffer.from(balanceAfter).toString('hex'));
}