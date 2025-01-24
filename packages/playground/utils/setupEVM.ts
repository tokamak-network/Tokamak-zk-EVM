import { hexToBytes } from '../../frontend/synthesizer/libs/util/dist/esm/index.js';
import { Address } from '../../frontend/synthesizer/libs/util/dist/esm/index.js';
import { Account } from '../../frontend/synthesizer/libs/util/dist/esm/index.js';
import { keccak256 } from 'ethereum-cryptography/keccak'

export const setupEVM = async (evm: any, from: string, contractCode: Uint8Array, contractAddr: Address, sender: Address) => {

    // create contract address
    await evm.stateManager.putAccount(contractAddr, new Account())

    // deploy contract code
    await evm.stateManager.putCode(contractAddr, contractCode)

    // set balance
    const balanceSlot = '0x5'
    const senderBalanceSlot = keccak256(
        hexToBytes(
            '0x' + sender.toString().slice(2).padStart(64, '0') + balanceSlot.slice(2).padStart(64, '0'),
        ),
    )

    await evm.stateManager.putStorage(
        contractAddr,
        senderBalanceSlot,
        hexToBytes('0x' + 'de0b6b3a7640000'.padStart(64, '0')),
    )
}