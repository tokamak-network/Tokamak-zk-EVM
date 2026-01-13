// Usage: tsx examples/L2TONTransfer/main.ts <config.json>

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  bytesToHex,
  concatBytes,
  hexToBytes,
  setLengthLeft,
  utf8ToBytes,
} from '@ethereumjs/util';
import { jubjub } from "@noble/curves/misc.js";
import { deriveL2KeysFromSignature, fromEdwardsToAddress } from 'tokamak-l2js';
import { createSynthesizer } from '../../src/synthesizer/index.ts';
import { createCircuitGenerator } from '../../src/circuitGenerator/circuitGenerator.ts';
import { createSynthesizerOptsForSimulationFromRPC, SynthesizerSimulationOpts } from '../../src/interface/index.ts';
import { getUserStorageKey } from 'tokamak-l2js';
import { EdwardsPoint } from '@noble/curves/abstract/edwards';
import { writeCircuitJson } from '../../src/interface/node/jsonWriter.ts';
import { loadSubcircuitWasm } from '../../src/interface/node/wasmLoader.ts';
import { loadConfig } from './config.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(packageRoot, '.env') });
const RPC_URL_ENV_KEY = 'RPC_URL';

const getRpcUrlFromEnv = (): string => {
  const rpcUrl = process.env[RPC_URL_ENV_KEY];
  if (typeof rpcUrl !== 'string' || rpcUrl.length === 0) {
    throw new Error(`Environment variable ${RPC_URL_ENV_KEY} must be set in ${path.join(packageRoot, '.env')}`);
  }
  return rpcUrl;
};

const toSeedBytes = (seed: string) => setLengthLeft(utf8ToBytes(seed), 32);

const main = async () => {
  const configPath = process.argv[2];
  if (!configPath) {
    throw new Error('Config file path required. Usage: tsx examples/L2TONTransfer/main.ts <config.json>');
  }

  const config = await loadConfig(configPath);
  const rpcUrl = getRpcUrlFromEnv();

  const privateSignatures = config.privateKeySeedsL2.map((seed) => 
    bytesToHex(jubjub.utils.randomPrivateKey(toSeedBytes(seed)))
  );

  const derivedPrivateKeyListL2: Uint8Array[] = [];
  const derivedPublicKeyListL2: EdwardsPoint[] = [];
  privateSignatures.map( sig => {
    const keySet = deriveL2KeysFromSignature(sig);
    derivedPrivateKeyListL2.push(keySet.privateKey);
    derivedPublicKeyListL2.push(jubjub.Point.fromBytes(keySet.publicKey));
  })

  const erc20TxsData = config.txsData.map((txData) => {
    const senderL2PrvKey = derivedPrivateKeyListL2[txData.senderIndex];
    const tokenRecipientPubKey = derivedPublicKeyListL2[txData.recipientIndex];
    const tokenRecipientAddress = fromEdwardsToAddress(tokenRecipientPubKey);
    const data = concatBytes(
      setLengthLeft(hexToBytes(config.transferSelector), 4),
      setLengthLeft(tokenRecipientAddress.toBytes(), 32),
      setLengthLeft(hexToBytes(txData.amount), 32),
    );
    return {
      senderL2PrvKey,
      nonce: txData.nonce,
      data,
    };
  });

  const initStorageKeys = [
    {
      L1: setLengthLeft(hexToBytes(config.initStorageKey), 32),
      L2: setLengthLeft(hexToBytes(config.initStorageKey), 32),
    },
  ];

  for (const slot of config.userStorageSlots) {
    for (let userIdx = 0; userIdx < config.addressListL1.length; userIdx++) {
      const L1key = getUserStorageKey([config.addressListL1[userIdx], slot], 'L1');
      const L2key = getUserStorageKey([fromEdwardsToAddress(derivedPublicKeyListL2[userIdx]), slot], 'TokamakL2');
      initStorageKeys.push({
        L1: L1key,
        L2: L2key,
      });
    }
  }

  const simulationOpts: SynthesizerSimulationOpts = {
    rpcUrl,
    initStorageKeys,
    blockNumber: config.blockNumber,
    contractAddress: config.contractAddress,
    erc20TxsData,
  };

  const synthesizerOpts = await createSynthesizerOptsForSimulationFromRPC(simulationOpts);
  const synthesizer = await createSynthesizer(synthesizerOpts);
  const runBlockResult = await synthesizer.synthesizeBlock();
  const subcircuitBuffers = loadSubcircuitWasm();
  const circuitGenerator = await createCircuitGenerator(synthesizer, subcircuitBuffers);
  writeCircuitJson(circuitGenerator);

  if (runBlockResult.logsBloom.length > 0) {
    for (const [txIndex, txResult] of runBlockResult.results.entries()) {
      console.log(`Tx index: ${txIndex}`);
      console.log(`Tx execution error: ${txResult.execResult.exceptionError}`)
      if (txResult.execResult.logs !== undefined) {
        for (const [logIndex, log] of txResult.execResult.logs.entries()) {
          console.log(`Log index: ${logIndex}`);
          console.log(`CA: ${bytesToHex(log[0])}`);
          for (const topic of log[1]) {
            console.log(`Topic: ${bytesToHex(topic)}`);
          }
          console.log(`Data: ${bytesToHex(log[2])}`);
        }
      }
    }
  }
};

void main().catch(err => {
  // Prevent errors from being accumulated.
  console.error(err);
  process.exit(1);
});
