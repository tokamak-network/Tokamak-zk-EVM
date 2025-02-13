import { keccak256 } from 'ethereum-cryptography/keccak'
import { hexToBytes, Address, Account } from '../../../libs/util/dist/esm/index.js';

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
const IMPLEMENTATION_SLOT = '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3'

export const setupUSDCFromCalldata = async (
    evm: any,
    proxyAddr: Address,
    implementationV1Addr: Address,
    implementationV2Addr: Address,
    proxyCode: Uint8Array,
    v1Code: Uint8Array,
    v2Code: Uint8Array,
    proxyStorageLayout: StorageLayout,
    v1StorageLayout: StorageLayout,
    v2StorageLayout: StorageLayout,
    calldata: string,
    sender: Address,
) => {
    console.log('=== Setting up USDC Environment ===');
    console.log('Proxy address:', proxyAddr.toString());
    console.log('Implementation V1 address:', implementationV1Addr.toString());
    console.log('Implementation V2 address:', implementationV2Addr.toString());

    // Setup all contract accounts
    await evm.stateManager.putAccount(proxyAddr, new Account())
    await evm.stateManager.putAccount(implementationV1Addr, new Account())
    await evm.stateManager.putAccount(implementationV2Addr, new Account())
    await evm.stateManager.putAccount(sender, new Account())

    // Deploy all contract codes
    await evm.stateManager.putCode(proxyAddr, proxyCode)
    await evm.stateManager.putCode(implementationV1Addr, v1Code)
    await evm.stateManager.putCode(implementationV2Addr, v2Code)

    // Verify code deployment
    const proxyDeployedCode = await evm.stateManager.getCode(proxyAddr)
    const v1DeployedCode = await evm.stateManager.getCode(implementationV1Addr)
    const v2DeployedCode = await evm.stateManager.getCode(implementationV2Addr)

    console.log('Proxy code length:', proxyDeployedCode.length);
    console.log('V1 code length:', v1DeployedCode.length);
    console.log('V2 code length:', v2DeployedCode.length);

    // Setup delegation chain with verification
    await evm.stateManager.putStorage(
        proxyAddr,
        hexToBytes(IMPLEMENTATION_SLOT),
        hexToBytes('0x' + implementationV1Addr.toString().slice(2).padStart(64, '0'))
    )
    await evm.stateManager.putStorage(
        implementationV1Addr,
        hexToBytes(IMPLEMENTATION_SLOT),
        hexToBytes('0x' + implementationV2Addr.toString().slice(2).padStart(64, '0'))
    )

    // Verify delegation chain
    const proxyImpl = await evm.stateManager.getStorage(proxyAddr, hexToBytes(IMPLEMENTATION_SLOT))
    const v1Impl = await evm.stateManager.getStorage(implementationV1Addr, hexToBytes(IMPLEMENTATION_SLOT))
    
    console.log('Proxy implementation:', Buffer.from(proxyImpl).toString('hex'));
    console.log('V1 implementation:', Buffer.from(v1Impl).toString('hex'));

    // Helper function to find balance slot in storage layout
    const findBalanceSlot = (layout: StorageLayout) => {
        return layout.storageLayout.storage.find(
            item => item.label === '_balances' || item.label === 'balances'
        )?.slot
    }

    // Get balance slots from each layout
    const proxyBalanceSlot = findBalanceSlot(proxyStorageLayout)
    const v1BalanceSlot = findBalanceSlot(v1StorageLayout)
    const v2BalanceSlot = findBalanceSlot(v2StorageLayout)

    // Parse calldata
    const params = calldata.slice(10)
    const functionSig = calldata.slice(0, 10)

      

    switch(functionSig) {
        case '0xa9059cbb': { // transfer
            const to = '0x' + params.slice(24, 64)
            const amount = BigInt('0x' + params.slice(64))
            
            console.log('=== Setup Debug Info ===')
            console.log('Sender:', sender.toString())
            console.log('To:', to)
            console.log('Amount:', amount.toString())

            // Setup recipient account
            await evm.stateManager.putAccount(new Address(hexToBytes(to)), new Account())


            // Setup balances in all contracts if needed
            if (v2BalanceSlot) {  // Use V2's layout as it's the final implementation
                console.log('v2BalanceSlot:', v2BalanceSlot)
                const balanceKey = keccak256(
                    hexToBytes(
                        '0x' + sender.toString().slice(2).padStart(64, '0') + 
                        v2BalanceSlot.padStart(64, '0')
                    )
                )
                
                // Set initial balance for sender
                const initialBalance = amount + BigInt(1000)  // Some buffer
                await evm.stateManager.putStorage(
                    proxyAddr,  // Store in proxy's storage
                    balanceKey,
                    hexToBytes('0x' + initialBalance.toString(16).padStart(64, '0'))
                )

                 const senderBalanceSlot = keccak256(
    hexToBytes(
        '0x' + sender.toString().slice(2).padStart(64, '0') + 
        v2BalanceSlot.padStart(64, '0'),
    ),
);


// 검증을 위해 저장된 값 확인
const storedBalance = await evm.stateManager.getStorage(proxyAddr, senderBalanceSlot);
console.log('Stored balance:', Buffer.from(storedBalance).toString('hex'));
            }

            break
        }
        case '0x095ea7b3': { // approve
            const spender = '0x' + params.slice(24, 64)
            const amount = BigInt('0x' + params.slice(64))
            
            // Setup spender account
            await evm.stateManager.putAccount(new Address(hexToBytes(spender)), new Account())

            // Find allowance slots
            const findAllowanceSlot = (layout: StorageLayout) => {
                return layout.storageLayout.storage.find(
                    item => item.label === 'allowed' 
                )?.slot
            }

            const v2AllowanceSlot = findAllowanceSlot(v2StorageLayout)
            if (v2AllowanceSlot) {
                 // Calculate storage slot for allowance
        // allowances[owner][spender]
        const ownerKey = keccak256(
            hexToBytes(
                '0x' + sender.toString().slice(2).padStart(64, '0') + 
                v2AllowanceSlot.padStart(64, '0')
            )
        )
        
        const spenderKey = keccak256(
            hexToBytes(
                '0x' + spender.slice(2).padStart(64, '0') + 
                ownerKey.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '').padStart(64, '0')
            )
        )

        // Set initial allowance in proxy's storage
        await evm.stateManager.putStorage(
            proxyAddr,  // Store in proxy's storage
            spenderKey,
            hexToBytes('0x' + amount.toString(16).padStart(64, '0'))  // 
        )

        console.log('Setup allowance mapping:', {
            owner: sender.toString(),
            spender: spender,
            slot: v2AllowanceSlot,
            storageKey: Buffer.from(spenderKey).toString('hex')
        })

        // Verify the allowance was set
        const currentAllowance = await evm.stateManager.getStorage(proxyAddr, spenderKey)
        console.log('Current allowance:', BigInt('0x' + Buffer.from(currentAllowance).toString('hex')).toString())
            }

            break
        }
    }

    console.log('USDC Environment setup completed')
    console.log('==================')
}