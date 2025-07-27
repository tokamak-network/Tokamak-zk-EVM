

import { keccak256, solidityPacked, solidityPackedKeccak256 } from "ethers";
import { MPT } from "./MPTManager";
import { addHexPrefix, bigIntToBytes, bytesToHex, hexToBytes, setLengthLeft } from "@ethereumjs/util";
import { getStorageKey } from "./utils";
import { MT } from "./MTManager";
import { LegacyTx } from "@ethereumjs/tx";
import { ZKPSystem } from "./ZKPSystem";
import { L2SignatureSystem } from "./signatureSystem";

// Real TON Contract Address on Ethereum Mainnet
const TON_CONTRACT_ADDR = '0x2be5e8c109e2197D077D13A82dAead6a9b3433C5';

const L1ADDRS = [
    '0xd8eE65121e51aa8C75A6Efac74C4Bbd3C439F78f',
    '0x838F176D94990E06af9B57E470047F9978403195',
    '0x01E371b2aD92aDf90254df20EB73F68015E9A000',
    '0xbD224229Bf9465ea4318D45a8ea102627d6c27c7',
    '0x6FD430995A19a57886d94f8B5AF2349b8F40e887',
    '0x0CE8f6C9D4aD12e56E54018313761487d2D1fee9',
    '0x60be9978F805Dd4619F94a449a4a798155a05A56'
]

const USERL2PUBKEYS: Uint8Array[] = []
for (let idx = 0; idx < L1ADDRS.length; idx++) {
    // This is a dummy creation of L2 public keys
    USERL2PUBKEYS.push(setLengthLeft(bigIntToBytes(BigInt(idx)), 64))
}


const USERSLOTS = [0]
const CONTRACTSLOTS: number[] = [] 

const BLOCK_NUMBER = 20000000; // Example: Use a block number from mid-2024 or earlier for stability

const RPCURL = 'https://eth-mainnet.g.alchemy.com/v2/e_QJd40sb7aiObJisG_8Q'
const USER_PRVKEY = setLengthLeft(hexToBytes(addHexPrefix(solidityPackedKeccak256(['string'], [
    "Jake's wallet"
]))), 32)


async function main() {
    let log

    //// Layer 1 SMARTCONTRACT
    // Layer1 MPT -> Layer2 MPT
    const mpt = await MPT.buildFromRPC(BLOCK_NUMBER, TON_CONTRACT_ADDR, CONTRACTSLOTS, USERSLOTS, L1ADDRS, USERL2PUBKEYS, RPCURL)
    // L2MPT -> MT conversion
    const mt = await MT.buildFromMPT(mpt)
    // ZKP setup
    const zkp = ZKPSystem.setup()
    ////

    //// Layer2
    // Creating transactions by a user
    const nTx = 7
    const amounts = Array.from({length: nTx}, () => 10000000n)
    const txBatch: LegacyTx[] = await mpt.createErc20Transfers(USER_PRVKEY, L1ADDRS, amounts, USERSLOTS[0])
    // User simulates update of the MPT
    const simulatedMPTSequence = await mpt.simulateTransactionBatch(txBatch)
    const initialStorageLeaves = await simulatedMPTSequence[0].serializeUserStorageLeaves()
    console.log(`Leaves of the initial storage trie in [Storage Key, Slot, L1 Address, Value]:\n${initialStorageLeaves}`)
    const finalStorageLeaves = await simulatedMPTSequence[nTx].serializeUserStorageLeaves()
    console.log(`Leaves of the final storage trie in [Storage Key, Slot, L1 Address, Value]:\n${finalStorageLeaves}`)
    // User simulates update of the MT (from the simulated MPT)
    const simulatedMt = await mt.simulateUpdatedMPT(simulatedMPTSequence)
    const mtRootSequence = simulatedMt.userStorageRootsByNonce[nTx][USERSLOTS[0]]
    console.log(`History of the roots of the balance Merkle tree:\n${mtRootSequence}`)
    // User generates zkp proof
    const publicInput = [
        ...initialStorageLeaves,
        ...finalStorageLeaves,
        mpt.L2Signature.privateToPublic(USER_PRVKEY).toString(),
        ...mtRootSequence.toString(),
    ]
    zkp.prove()

    // Updated MPT -> MT conversion -> Simulated MT
    // Simulated MT -> ZKP generation
    // ZKP -> Verify -> Accept updated MPT
    // Updated MPT -> Accept simulated MT


    // Send Layer2 MPT -> Layer1 MPT



    const prevVal = await mpt.getStorage(9, L1ADDRS[2])
    const key = keccak256(solidityPacked(['uint256','uint256'], [L1ADDRS[2], 9]))
    const keyBytes = hexToBytes(addHexPrefix(key))
    const afterVal = await simulatedMPTSequence[1].getStorage(9, L1ADDRS[2])
}

main()