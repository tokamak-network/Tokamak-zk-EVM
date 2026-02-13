// Usage: tsx examples/erc20Transfers/main.ts <config.json>

import {
  bytesToHex,
  bytesToBigInt,
  concatBytes,
  createAddressFromString,
  hexToBytes,
  setLengthLeft,
} from '@ethereumjs/util';
import { jubjub } from "@noble/curves/misc.js";
import { createStateManagerOptsFromChannelConfig, createTokamakL2StateManagerFromL1RPC, createTokamakL2Tx, deriveL2KeysFromSignature, fromEdwardsToAddress, TokamakL2TxData } from 'tokamak-l2js';
import { createSynthesizer } from '../../src/synthesizer/index.ts';
import { createCircuitGenerator } from '../../src/circuitGenerator/circuitGenerator.ts';
import { EdwardsPoint } from '@noble/curves/abstract/edwards';
import { writeCircuitJson, writeEvmAnalysisJson } from '../../src/interface/node/jsonWriter.ts';
import { loadSubcircuitWasm } from '../../src/interface/node/wasmLoader.ts';
import { getRpcUrlFromEnv } from '../../src/interface/node/env.ts';
import { getBlockInfoFromRPC } from '../../src/interface/rpc/rpc.ts';
import { NUMBER_OF_PREV_BLOCK_HASHES } from '../../src/interface/qapCompiler/importedConstants.ts';
import { EXAMPLES_ENV_PATH, loadConfig, toSeedBytes } from './utils.ts';

const main = async () => {
  const configPath = process.argv[2];
  if (!configPath) {
    throw new Error('Config file path required. Usage: tsx examples/Erc20Transfers/main.ts <config.json>');
  }

  const config = await loadConfig(configPath);
  const rpcUrl = getRpcUrlFromEnv(config.network, process.env, { envPath: EXAMPLES_ENV_PATH });

  const privateSignatures = config.participants.map((participant) => 
    bytesToHex(jubjub.utils.randomPrivateKey(toSeedBytes(participant.prvSeedL2)))
  );

  const derivedPrivateKeyListL2: Uint8Array[] = [];
  const derivedPublicKeyListL2: EdwardsPoint[] = [];
  privateSignatures.map( sig => {
    const keySet = deriveL2KeysFromSignature(sig);
    derivedPrivateKeyListL2.push(keySet.privateKey);
    derivedPublicKeyListL2.push(jubjub.Point.fromBytes(keySet.publicKey));
  })

  const senderL2PrvKey = derivedPrivateKeyListL2[config.senderIndex];
  const tokenRecipientPubKey = derivedPublicKeyListL2[config.recipientIndex];
  const tokenRecipientAddress = fromEdwardsToAddress(tokenRecipientPubKey);

  const callData = concatBytes(
    setLengthLeft(hexToBytes(config.transferSelector), 4),
    setLengthLeft(tokenRecipientAddress.toBytes(), 32),
    setLengthLeft(hexToBytes(config.amount), 32),
  );

  const stateManagerOpts = createStateManagerOptsFromChannelConfig(config);
  const stateManager = await createTokamakL2StateManagerFromL1RPC(rpcUrl, stateManagerOpts);
  const blockInfo = await getBlockInfoFromRPC(rpcUrl, config.blockNumber, NUMBER_OF_PREV_BLOCK_HASHES);

  const txData: TokamakL2TxData = {
    nonce: BigInt(config.txNonce),
    to: createAddressFromString(config.entryContractAddress),
    data: callData,
    senderPubKey: jubjub.Point.BASE.multiply(bytesToBigInt(senderL2PrvKey)).toBytes(),
  };
  const unsignedTransaction = createTokamakL2Tx(txData, { common: stateManagerOpts.common });
  const signedTransaction = unsignedTransaction.sign(senderL2PrvKey);

  const synthesizer = await createSynthesizer({
    signedTransaction,
    blockInfo,
    stateManager,
  });
  const runTxResult = await synthesizer.synthesizeTX();
  await writeEvmAnalysisJson(synthesizer);
  const subcircuitBuffers = loadSubcircuitWasm();
  const circuitGenerator = await createCircuitGenerator(synthesizer, subcircuitBuffers);
  writeCircuitJson(circuitGenerator);

  console.log(`Exception Error: ${runTxResult.execResult.exceptionError}`);
  console.log(`Return Value: ${bytesToHex(runTxResult.execResult.returnValue)}`);
  if (runTxResult.execResult.logs) {
    for (const [index, log] of runTxResult.execResult.logs.entries()) {
      console.log(`Log index: ${index}`);
      console.log(`CA: ${bytesToHex(log[0])}`);
      for (const topic of log[1]) {
        console.log(`Topic: ${bytesToHex(topic)}`);
      }
      console.log(`Data: ${bytesToHex(log[2])}`);
    }
  }
};

void main().catch(err => {
  // Prevent errors from being accumulated.
  console.error(err);
  process.exit(1);
});
