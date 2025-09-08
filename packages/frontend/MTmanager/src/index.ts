

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
    console.log(`
        1. Preparation for opening a Layer2, conducted on Layer 1, which includes:\n
        \t- Reconstruction of a small-scaled version of contract state, called MPT,\n
        \t- Conversion of MPT to Merkle Trees,\n
        \t- Setup ZKP system.\n
    `)
    //// Layer 1 SMARTCONTRACT//////////////////////
    // Layer1 MPT -> Layer2 MPT
    let mpt = await MPT.buildFromRPC(BLOCK_NUMBER, TON_CONTRACT_ADDR, CONTRACTSLOTS, USERSLOTS, L1ADDRS, USERL2PUBKEYS, RPCURL)
    // L2MPT -> MT conversion
    const mt = await MT.buildFromMPT(mpt)
    // ZKP setup
    const zkp = ZKPSystem.setup()
    ///////////////////////////////////////////
    console.log(`
        Once the preparation has been done,\n
        \t- The initial roots of MPT and MTs have been recorded on-chain,\n
        \t- Pairing between users' L1 and L2 addresses have been recorded on-chain.\n
    `)

    console.log(`
        2. Based on the initial MPT and MTs generated on-chain, an L2 user creates a batch of transactions.\n
    `)
    //// Layer2////////////////////////////////////
    // Creating transactions by a user
    const nTx = 7
    const amounts = Array.from({length: nTx}, () => 10000000n)
    const txBatch: LegacyTx[] = await mpt.createErc20Transfers(USER_PRVKEY, L1ADDRS, amounts, USERSLOTS[0])
    console.log(`
        The transaction batch is then sent to the leader.\n
    `)

    // Both user and leader simulates update of the MPT
    console.log(`
        3. The transaction batch is simulated by both the user and leader. The simulation is not applied to the L2 MPT yet.\n
    `)
    const simulatedMPTSequence = await mpt.simulateTransactionBatch(txBatch)
    const initialStorageLeaves = await simulatedMPTSequence[0].serializeUserStorageLeaves()
    // console.log(`Leaves of the initial storage trie in [Storage Key, Slot, L1 Address, Value]:\n${initialStorageLeaves}`)
    const finalStorageLeaves = await simulatedMPTSequence[nTx].serializeUserStorageLeaves()
    // console.log(`Leaves of the final storage trie in [Storage Key, Slot, L1 Address, Value]:\n${finalStorageLeaves}`)
    
    console.log(`
        Given the simulated MPT, The user and leader both simulate updates on MTs, which provide inputs for ZKP.\n
    `)
    // Both user and leader simulates update of the MT (from the simulated MPT)
    const simulatedMt = await mt.simulateUpdatedMPT(simulatedMPTSequence)
    const mtRootSequence = simulatedMt.userStorageRootSequenceBySlot[USERSLOTS[0]]
    // console.log(`History of the roots of the balance Merkle tree:\n${mtRootSequence}`)
    // User generates zkp proof
    const userPubKey = mpt.L2Signature.privateToPublic(USER_PRVKEY).toString()
    const publicInput = [
        ...initialStorageLeaves,
        ...finalStorageLeaves,
        userPubKey,
        ...mtRootSequence.toString(),
    ]
    const mptDetails = []
    for (const simulatedMPT of simulatedMPTSequence) {
        mptDetails.push( ...await simulatedMPT.serializeUserStorageLeaves() )
    }
    const txDetails = []
    for (const tx of txBatch) {
        txDetails.push( tx.data.toString() )
    }
    const privateInput = [
        ...mptDetails,
        ...txDetails,
        USER_PRVKEY.toString(),
    ]
    console.log(`
        4. Given the simulated MPT and MTs, the user generates a ZKP.\n
    `)
    const proof = zkp.prove(publicInput, privateInput)

    console.log(`
        5. The user sends the ZKP to the leader.\n
    `)
    
    console.log(`
        6. The leader verifies the ZKP and, if it is valid, he finally applies the simulated MPT to the L2 MPT.\n
    `)
    // User submits the proof to the leader
    // Leader verifies the proof
    const result = zkp.verify(publicInput, proof)
    // If the ZKP is valid, the leader accepts the updated MPT.
    if (result === true){
        mpt = simulatedMPTSequence.at(-1)!
    }

    // Layer2
    const tx = await mpt.createErc20Transfers(USER_PRVKEY, L1ADDRS[2], '0xce1e1ff314be3c0000', USERSLOTS[0])
    let log
    // log = await mpt.serializeUserStorageLeaves()
    // console.log(log)
    const simulatedMPTSequence = await mpt.simulateTransactionBatch([tx])
    log = await simulatedMPTSequence[0].serializeUserStorageLeaves()
    console.log(log)
    log = await simulatedMPTSequence[1].serializeUserStorageLeaves()
    console.log(log)
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