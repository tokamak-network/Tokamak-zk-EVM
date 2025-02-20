import { hexToBytes, Address, Account } from '@ethereumjs/util';
import { keccak256 } from 'ethereum-cryptography/keccak';
import { EVM } from 'src/evm.js';

interface StorageItem {
    astId: number;
    contract: string;
    label: string;
    offset: number;
    slot: string;
    type: string;
}

interface StorageLayout {
    storageLayout: {
        storage: StorageItem[];
        types: {
            [key: string]: {
                encoding: string;
                label: string;
                numberOfBytes: string;
                key?: string;
                value?: string;
            };
        };
    };
}

export const setupEVMFromCalldata = async (
    evm: EVM,
    contractAddr: Address,
    contractCode: Uint8Array,
    storageLayout: StorageLayout,
    calldata: string,
    sender: Address,
) => {
    // Create contract account and deploy code
    await evm.stateManager.putAccount(contractAddr, new Account());
    await evm.stateManager.putCode(contractAddr, contractCode);

    const selector = calldata.slice(0, 10);
    const params = calldata.slice(10);

    // Find relevant storage slots from layout
    const findSlot = (labelToFind: string) => {
        const item = storageLayout.storageLayout.storage.find(item => item.label === labelToFind);
        // if (!item) throw new Error(`Storage slot not found for ${labelToFind}`);
        return item;
    };

    switch (selector) {
        // transfer(address,uint256)
        case '0xa9059cbb': {
            const recipient = '0x' + params.slice(24, 64);
            const amount = BigInt('0x' + params.slice(64));
            
            // Find balances mapping slot from layout
            const balancesItem = findSlot('_balances'); 
            // If not found, try alternative names
            const balanceSlot = balancesItem?.slot || 
                              findSlot('balances')?.slot || 
                findSlot('_balance')?.slot;
           
            
            if (balanceSlot === undefined) throw new Error(`Storage slot not found for _balances`);
            
          
            const senderBalanceSlot = keccak256(
                hexToBytes(
                    '0x' + sender.toString().slice(2).padStart(64, '0') + 
                    balanceSlot.padStart(64, '0'),
                ),
            );

                 // Set initial balance for sender
                const initialBalance = amount + BigInt(1000)    // Some buffer
            
            await evm.stateManager.putStorage(
                contractAddr,
                senderBalanceSlot,
                hexToBytes('0x' + initialBalance.toString(16).padStart(64, '0')),
            );

            // 검증을 위해 저장된 값 확인
const storedBalance = await evm.stateManager.getStorage(contractAddr, senderBalanceSlot);
console.log('Stored balance:', Buffer.from(storedBalance).toString('hex'));
            
            break;
        }

        // approve(address,uint256)
        case '0x095ea7b3': {
            const spender = '0x' + params.slice(24, 64);
            const amount = BigInt('0x' + params.slice(64));
            
            console.log('=== Setup Debug Info ===');
            console.log('Sender:', sender.toString());
            console.log('Spender:', spender);
            console.log('Amount:', amount.toString());

            // 실제 approve 실행을 위한 초기 환경만 설정
            // 스토리지 변경은 하지 않음
            await evm.stateManager.putAccount(spender, new Account());
            await evm.stateManager.putAccount(sender, new Account());

            console.log('Environment setup completed');
            console.log('==================');

            break;
        }
            
        // transferFrom(address,address,uint256)
        case '0x23b872dd': {
            const from = '0x' + params.slice(24, 64);
            const to = '0x' + params.slice(88, 128);
            const amount = BigInt('0x' + params.slice(128));
            
            // Find balances mapping slot
            const balancesItem = findSlot('_balances') || 
                               findSlot('balances') || 
                               findSlot('_balance');
            const balanceSlot = balancesItem?.slot;

            if (balanceSlot === undefined) throw new Error(`Storage slot not found for _balances`);
            
            // Setup from balance
            const fromBalanceSlot = keccak256(
                hexToBytes(
                    '0x' + from.slice(2).padStart(64, '0') + 
                    balanceSlot.padStart(64, '0'),
                ),
            );
            
            await evm.stateManager.putStorage(
                contractAddr,
                fromBalanceSlot,
                hexToBytes('0x' + amount.toString(16).padStart(64, '0')),
            );
            
            // Find and setup allowance
            const allowancesItem = findSlot('_allowances') || 
                                 findSlot('allowed') || 
                                 findSlot('allowances');
            const allowanceSlot = allowancesItem?.slot;

            if (allowanceSlot === undefined) throw new Error(`Storage slot not found for _allowances`);
            

            const ownerKey = keccak256(
                hexToBytes(
                    '0x' + from.slice(2).padStart(64, '0') + 
                    allowanceSlot.padStart(64, '0'),
                ),
            );

            const spenderKey = keccak256(
                hexToBytes(
                    '0x' + sender.toString().slice(2).padStart(64, '0') + 
                    ownerKey.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '').padStart(64, '0'),
                ),
            );
            
            await evm.stateManager.putStorage(
                contractAddr,
                spenderKey,
                hexToBytes('0x' + amount.toString(16).padStart(64, '0')),
            );
            break;
        }

        // approveAndCall(address,uint256,bytes)
        case '0xcae9ca51': {
            const spender = '0x' + params.slice(24, 64);
            const amount = BigInt('0x' + params.slice(64, 128));
            // bytes data parameter는 동적 타입이라 offset부터 시작
            
            console.log('=== Setup Debug Info ===');
            console.log('Sender:', sender.toString());
            console.log('Spender:', spender);
            console.log('Amount:', amount.toString());

            // Find allowances mapping slot
            const allowancesItem = findSlot('_allowances') || 
                                 findSlot('allowed') || 
                                 findSlot('allowances');
            const allowanceSlot = allowancesItem?.slot;

            if (allowanceSlot === undefined) throw new Error(`Storage slot not found for _allowances`);

            // Calculate nested mapping slots for allowance
            const ownerKey = keccak256(
                hexToBytes(
                    '0x' + sender.toString().slice(2).padStart(64, '0') + 
                    allowanceSlot.padStart(64, '0'),
                ),
            );

            const spenderKey = keccak256(
                hexToBytes(
                    '0x' + spender.slice(2).padStart(64, '0') + 
                    ownerKey.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '').padStart(64, '0'),
                ),
            );

            // Set initial allowance
            await evm.stateManager.putStorage(
                contractAddr,
                spenderKey,
                hexToBytes('0x' + amount.toString(16).padStart(64, '0')),
            );

            // Setup accounts
            await evm.stateManager.putAccount(spender, new Account());
            await evm.stateManager.putAccount(sender, new Account());

            console.log('Environment setup completed');
            console.log('==================');
            
            break;
        }
    }
};