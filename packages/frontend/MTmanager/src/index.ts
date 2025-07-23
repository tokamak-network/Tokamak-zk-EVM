

import { MPT } from "./MPTManager";

// Real USDC Contract Address on Ethereum Mainnet
const USDC_CONTRACT_ADDR = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const L1ADDRS = [
    // '0xC23bb7A0204C536F0EB41aC2b46d63eA2583C2B5',
    '0xedAD1e35D420b1E67CDBC84aAc3b62bFFCb0847C',
    '0x1c92c40AD9bdF31CcEe1B3e7dB856b158A7F63e7',
    '0xa91948FBa077BbA448809E90A6b40C533AD5f96A',
    '0xaeEfe9b5fd62Afc2FBB2537cF7761b5609a72aCC',
    '0x2c831F3dBB66945AaB2dbD08D6A9feb4DE4C8497',
    '0xD07C3B2e2E0f51c9D91B50b92347923a50b460F6',
    '0xd302043F6a3b79353a5FeD05C55E1123C1aF91aa'
]

const L2ADDRS = [
    // '0xC23bb7A0204C536F0EB41aC2b46d63eA2583C2B5',
    '0xedAD1e35D420b1E67CDBC84aAc3b62bFFCb0847C',
    '0x1c92c40AD9bdF31CcEe1B3e7dB856b158A7F63e7',
    '0xa91948FBa077BbA448809E90A6b40C533AD5f96A',
    '0xaeEfe9b5fd62Afc2FBB2537cF7761b5609a72aCC',
    '0x2c831F3dBB66945AaB2dbD08D6A9feb4DE4C8497',
    '0xD07C3B2e2E0f51c9D91B50b92347923a50b460F6',
    '0xd302043F6a3b79353a5FeD05C55E1123C1aF91aa'
]


const SLOTS = [9]; 

const BLOCK_NUMBER = 20000000; // Example: Use a block number from mid-2024 or earlier for stability

const RPCURL = 'https://eth-mainnet.g.alchemy.com/v2/e_QJd40sb7aiObJisG_8Q'
const USER_PRVKEY = 'Jake'


async function main() {
    const mpt = await MPT.buildFromRPC(BLOCK_NUMBER, USDC_CONTRACT_ADDR, SLOTS, L1ADDRS, L2ADDRS, RPCURL)
    const tx = mpt.createErc20Transfer(USER_PRVKEY, L1ADDRS[2], '0x10')
    console.log(tx.getSenderAddress())
    const simulated_mpt = await mpt.simulateTransactionBatch([tx])

}

main()