import { hexToBytes } from '../../frontend/synthesizer/libs/util/dist/esm/index.js';
import { Address } from '../../frontend/synthesizer/libs/util/dist/esm/index.js';
import { Account } from '../../frontend/synthesizer/libs/util/dist/esm/index.js';
import { keccak256 } from 'ethereum-cryptography/keccak'
import { getBalanceSlot } from './etherscanApi';

export const setupEVM = async (evm: any, from: string, contractCode: Uint8Array, contractAddr: Address, sender: Address) => {
    // Create contract address
    await evm.stateManager.putAccount(contractAddr, new Account())

    // Deploy contract code
    await evm.stateManager.putCode(contractAddr, contractCode)

    // Get balance slot dynamically from contract storage layout
    const balanceSlot = await getBalanceSlot(contractAddr.toString())
    console.log(balanceSlot);   

    const senderBalanceSlot = keccak256(
        hexToBytes(
            '0x' + sender.toString().slice(2).padStart(64, '0') + balanceSlot.toString().slice(2).padStart(64, '0'),
        ),
    )

    await evm.stateManager.putStorage(
        contractAddr,
        senderBalanceSlot, 
        hexToBytes('0x' + '00000000000000000000000000000000000000000A968163F0A57B400000000'),
    )
}