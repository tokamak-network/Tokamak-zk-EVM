// DEBUG=ethjs,evm:*,evm:*:* tsx MCOPY.ts

import {
  addHexPrefix,
  bigIntToBytes,
  bytesToBigInt,
  bytesToHex,
  concatBytes,
  createAddressFromString,
  equalsBytes,
  hexToBigInt,
  hexToBytes,
  setLengthLeft,
  utf8ToBytes,
} from '@ethereumjs/util';
import { jubjub } from '@noble/curves/misc';
import { fromEdwardsToAddress } from '../../src/TokamakL2JS/index.ts';
import { createSynthesizer } from '../../src/synthesizer/index.ts';
import { createCircuitGenerator } from '../../src/circuitGenerator/circuitGenerator.ts';
import { poseidon_raw } from '../../src/synthesizer/params/index.ts';

const SENDER_L2_SEED = "Jake's L2 wallet";
const senderL2PrvKey = jubjub.utils.randomPrivateKey(setLengthLeft(utf8ToBytes(SENDER_L2_SEED), 32));
const senderL2PubKey = jubjub.Point.BASE.multiply(bytesToBigInt(senderL2PrvKey)).toBytes();
// const {secretKey: senderL2PrvKey, publicKey: senderL2PubKey} = jubjub.keygen(setLengthLeft(utf8ToBytes(SENDER_L2_SEED), 32))

// Reference: TON transfer transaction: 0xa0090893a2d5f79b67cebcb65eac3efc92820ec09dc4ad9fe2bc29bbdcad2e41
const AMOUNT: `0x${string}` = '0x4563918244f400000';
// const AMOUNT: `0x${string}` = '0x00'
const TOKEN_RECEPIENT_PUB_KEY = jubjub.keygen(setLengthLeft(utf8ToBytes('Recepient'), 32)).publicKey;
const TOKEN_RECEPIENT_ADDRESS = fromEdwardsToAddress(TOKEN_RECEPIENT_PUB_KEY);
const CALLDATA = concatBytes(
  setLengthLeft(hexToBytes('0xa9059cbb'), 4),
  setLengthLeft(TOKEN_RECEPIENT_ADDRESS.toBytes(), 32),
  setLengthLeft(hexToBytes(AMOUNT), 32),
);

const simulationOpts: SynthesizerSimulationOpts = {
  txNonce: 0n,
  rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/e_QJd40sb7aiObJisG_8Q',
  senderL2PrvKey,

  // Reference: TON transfer transaction: 0xa0090893a2d5f79b67cebcb65eac3efc92820ec09dc4ad9fe2bc29bbdcad2e41s
  blockNumber: 23224548,
  contractAddress: '0x2be5e8c109e2197D077D13A82dAead6a9b3433C5' as `0x${string}`,
  userStorageSlots: [0],

  // Example
  addressListL1: [
    '0x85cc7da8Ee323325bcD678C7CFc4EB61e76657Fb',
    '0xd8eE65121e51aa8C75A6Efac74C4Bbd3C439F78f',
    '0x838F176D94990E06af9B57E470047F9978403195',
    '0x01E371b2aD92aDf90254df20EB73F68015E9A000',
    '0xbD224229Bf9465ea4318D45a8ea102627d6c27c7',
    '0x6FD430995A19a57886d94f8B5AF2349b8F40e887',
    '0x0CE8f6C9D4aD12e56E54018313761487d2D1fee9',
    '0x60be9978F805Dd4619F94a449a4a798155a05A56',
  ] as `0x${string}`[],

  // Must be paired with the L1 addresses
  // The seed strings must be hidden. This is just an example.
  publicKeyListL2: [
    senderL2PubKey,
    TOKEN_RECEPIENT_PUB_KEY,
    jubjub.keygen(setLengthLeft(utf8ToBytes('0x838F176D94990E06af9B57E470047F9978403195'), 32)).publicKey,
    jubjub.keygen(setLengthLeft(utf8ToBytes('0x01E371b2aD92aDf90254df20EB73F68015E9A000'), 32)).publicKey,
    jubjub.keygen(setLengthLeft(utf8ToBytes('0xbD224229Bf9465ea4318D45a8ea102627d6c27c7'), 32)).publicKey,
    jubjub.keygen(setLengthLeft(utf8ToBytes('0x6FD430995A19a57886d94f8B5AF2349b8F40e887'), 32)).publicKey,
    jubjub.keygen(setLengthLeft(utf8ToBytes('0x0CE8f6C9D4aD12e56E54018313761487d2D1fee9'), 32)).publicKey,
    jubjub.keygen(setLengthLeft(utf8ToBytes('0x60be9978F805Dd4619F94a449a4a798155a05A56'), 32)).publicKey,
  ],
  callData: CALLDATA,
};

const main = async () => {
  const synthesizerOpts = await createSynthesizerOptsForSimulationFromRPC(simulationOpts);
  const synthesizer = await createSynthesizer(synthesizerOpts);
  const runTxResult = await synthesizer.synthesizeTX();
  const circuitGenerator = await createCircuitGenerator(synthesizer);
  circuitGenerator.writeOutputs();
  console.log(runTxResult.execResult.logs);
};

void main();
