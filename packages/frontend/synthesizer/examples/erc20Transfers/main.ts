// Usage: tsx examples/erc20Transfers/main.ts <config.json>

import {
  bytesToHex,
  concatBytes,
  hexToBytes,
  setLengthLeft,
} from '@ethereumjs/util';
import { jubjub } from "@noble/curves/misc.js";
import { deriveL2KeysFromSignature, fromEdwardsToAddress } from 'tokamak-l2js';
import { createSynthesizer } from '../../src/synthesizer/index.ts';
import { createCircuitGenerator } from '../../src/circuitGenerator/circuitGenerator.ts';
import { createSynthesizerOptsForSimulationFromRPC, SynthesizerSimulationOpts } from '../../src/interface/index.ts';
import { getUserStorageKey } from 'tokamak-l2js';
import { EdwardsPoint } from '@noble/curves/abstract/edwards';
import { writeCircuitJson, writeEvmAnalysisJson } from '../../src/interface/node/jsonWriter.ts';
import { loadSubcircuitWasm } from '../../src/interface/node/wasmLoader.ts';
import { getRpcUrlFromEnv } from '../../src/interface/node/env.ts';
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

  const initStorageKeys = config.preAllocatedKeys.map((storageKey) => ({
    L1: setLengthLeft(hexToBytes(storageKey), 32),
    L2: setLengthLeft(hexToBytes(storageKey), 32),
  }));

  for (const slot of config.userStorageSlots) {
    for (let userIdx = 0; userIdx < config.participants.length; userIdx++) {
      const participant = config.participants[userIdx];
      const L1key = getUserStorageKey([participant.addressL1, slot], 'L1');
      const L2key = getUserStorageKey([fromEdwardsToAddress(derivedPublicKeyListL2[userIdx]), slot], 'TokamakL2');
      initStorageKeys.push({
        L1: L1key,
        L2: L2key,
      });
    }
  }

  const simulationOpts: SynthesizerSimulationOpts = {
    txNonce: config.txNonce,
    rpcUrl,
    senderL2PrvKey,
    initStorageKeys,
    blockNumber: config.blockNumber,
    contractAddress: config.contractAddress,
    callData,
    callCodeAddresses: config.callCodeAddresses,
  };

  const synthesizerOpts = await createSynthesizerOptsForSimulationFromRPC(simulationOpts);
  const synthesizer = await createSynthesizer(synthesizerOpts);
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
