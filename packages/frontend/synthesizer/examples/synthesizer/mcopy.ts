// DEBUG=ethjs,evm:*,evm:*:* tsx MCOPY.ts

import { addHexPrefix, bigIntToBytes, bytesToBigInt, concatBytes, createAddressFromString, hexToBigInt, hexToBytes, setLengthLeft, utf8ToBytes } from '@ethereumjs/util';
import { createSynthesizer, SynthesizerInterface } from '../../src/tokamak/core/index.ts'
import { createSynthesizerOptsForSimulationFromRPC } from '../../src/tokamak/interface/index.ts'
import { SynthesizerOpts } from '../../src/tokamak/types/synthesizer.ts'
import { poseidon, getEddsaPublicKey, createTokamakL2StateManagerFromL1RPC, TokamakL2Tx, createTokamakL2Tx, TokamakL2TxData, TokamakL2StateManagerOpts } from '../../src/tokamak/TokamakL2JS/index.ts';
import { Common, CommonOpts, Sepolia } from '@ethereumjs/common';
import { StateManager } from '../../src/tokamak/core/synthesizer/handlers/stateManager.ts';
import { MerkleStateManager } from '@ethereumjs/statemanager';
import { jubjub } from '@noble/curves/misc';
import { batchBigIntTo32BytesEach, fromEdwardsToAddress } from '../../src/tokamak/TokamakL2JS/utils/index.ts';
import { TxOptions } from '@ethereumjs/tx';
import { mapToStr } from '../../src/tokamak/utils/utils.ts';


const SENDER_L2_SEED = "Jake's L2 wallet"
const {secretKey: senderL2PrvKey, publicKey: senderL2PubKey} = jubjub.keygen(utf8ToBytes(SENDER_L2_SEED))
const SENDER_L2_ADDR = fromEdwardsToAddress(senderL2PubKey).toString()

// Reference: TON transfer transaction: 0xa0090893a2d5f79b67cebcb65eac3efc92820ec09dc4ad9fe2bc29bbdcad2e41
const AMOUNT: `0x${string}` = '0x4563918244f400000'
const TOKEN_RECEPIENT: `0x${string}` = '0xd8eE65121e51aa8C75A6Efac74C4Bbd3C439F78f'
const CALLDATA = concatBytes(
  setLengthLeft(hexToBytes('0xa9059cbb'), 4),
  setLengthLeft(hexToBytes(TOKEN_RECEPIENT), 32),
  setLengthLeft(hexToBytes(AMOUNT), 32)
)

const simulationOpts = {
  rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/e_QJd40sb7aiObJisG_8Q',
  senderL2PrvKey,

  // Reference: TON transfer transaction: 0xa0090893a2d5f79b67cebcb65eac3efc92820ec09dc4ad9fe2bc29bbdcad2e41s
  blockNumber: 23224548,
  contractAddress: '0x2be5e8c109e2197D077D13A82dAead6a9b3433C5' as `0x${string}`,
  userStorageSlots: [0],

  addressListL1: [
    '0x85cc7da8Ee323325bcD678C7CFc4EB61e76657Fb',
    '0xd8eE65121e51aa8C75A6Efac74C4Bbd3C439F78f',
    '0x838F176D94990E06af9B57E470047F9978403195',
    '0x01E371b2aD92aDf90254df20EB73F68015E9A000',
    '0xbD224229Bf9465ea4318D45a8ea102627d6c27c7',
    '0x6FD430995A19a57886d94f8B5AF2349b8F40e887',
    '0x0CE8f6C9D4aD12e56E54018313761487d2D1fee9',
    '0x60be9978F805Dd4619F94a449a4a798155a05A56'
  ] as `0x${string}`[],
  addressListL2: [
    SENDER_L2_ADDR,
    TOKEN_RECEPIENT,
    '0x838F176D94990E06af9B57E470047F9978403195',
    '0x01E371b2aD92aDf90254df20EB73F68015E9A000',
    '0xbD224229Bf9465ea4318D45a8ea102627d6c27c7',
    '0x6FD430995A19a57886d94f8B5AF2349b8F40e887',
    '0x0CE8f6C9D4aD12e56E54018313761487d2D1fee9',
    '0x60be9978F805Dd4619F94a449a4a798155a05A56'
  ] as `0x${string}`[],
  callData: CALLDATA,
}

const main = async () => {
  const synthesizerOpts = createSynthesizerOptsForSimulationFromRPC(simulationOpts)
  const synthesizer = await createSynthesizer(synthesizerOpts)
  const runTxResult = await synthesizer.synthesizeTX()
  const stringPlacements = mapToStr(synthesizer.placements);
  console.log(`"placements": ${JSON.stringify(stringPlacements, null, 1)}`);
};

void main();
