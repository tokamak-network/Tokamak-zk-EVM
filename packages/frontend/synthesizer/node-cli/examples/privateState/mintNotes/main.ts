// Usage: tsx examples/privateState/mintNotes/main.ts <config.json>

import { bytesToHex, createAddressFromString, hexToBytes } from '@ethereumjs/util';
import {
  createTokamakL2Common,
  createStateManagerOptsFromChannelConfig,
  createTokamakL2StateManagerFromL1RPC,
  createTokamakL2Tx,
  TokamakL2TxData,
} from 'tokamak-l2js';
import { createCircuitGenerator } from '../../../src/core.ts';
import { createSynthesizer } from '../../../src/synthesizer/constructors.ts';
import { writeCircuitJson, writeEvmAnalysisJson } from '../../../src/interface/node/jsonWriter.ts';
import { loadSubcircuitWasm } from '../../../src/interface/node/wasmLoader.ts';
import { getBlockInfoFromRPC } from '../../../src/interface/rpc/rpc.ts';
import { installedSubcircuitLibrary } from '../../../src/interface/qapCompiler/installedLibrary.ts';
import {
  deriveParticipantKeys,
  getExampleRpcUrl,
  loadConfig,
  toStateManagerChannelConfig,
} from './utils.ts';

const main = async () => {
  const configPath = process.argv[2];
  if (!configPath) {
    throw new Error('Config file path required. Usage: tsx examples/privateState/mintNotes/main.ts <config.json>');
  }

  const config = await loadConfig(configPath);
  const rpcUrl = getExampleRpcUrl(config.network, process.env);
  const keyMaterial = deriveParticipantKeys(config.participants);
  const senderL2PrvKey = keyMaterial.privateKeys[config.senderIndex];
  if (!senderL2PrvKey) {
    throw new Error(`senderIndex must point to an existing participant; got ${config.senderIndex}`);
  }

  const callData = hexToBytes(config.calldata);
  const common = createTokamakL2Common();
  const stateManagerOpts = createStateManagerOptsFromChannelConfig(toStateManagerChannelConfig(config));
  const stateManager = await createTokamakL2StateManagerFromL1RPC(rpcUrl, stateManagerOpts);
  const blockInfo = await getBlockInfoFromRPC(
    rpcUrl,
    config.blockNumber,
    installedSubcircuitLibrary.numberOfPrevBlockHashes,
  );

  const txData: TokamakL2TxData = {
    nonce: BigInt(config.txNonce),
    to: createAddressFromString(config.function.entryContractAddress),
    data: callData,
    senderPubKey: keyMaterial.publicKeys[config.senderIndex].toBytes(),
  };
  const unsignedTransaction = createTokamakL2Tx(txData, { common });
  const signedTransaction = unsignedTransaction.sign(senderL2PrvKey);

  const synthesizer = await createSynthesizer({
    signedTransaction,
    blockInfo,
    stateManager,
  });
  const runTxResult = await synthesizer.synthesizeTX();
  await writeEvmAnalysisJson(synthesizer);
  if (process.env.PRIVATE_STATE_ANALYSIS_ONLY === '1') {
    return;
  }
  const subcircuitBuffers = loadSubcircuitWasm();
  const circuitGenerator = await createCircuitGenerator(synthesizer, subcircuitBuffers);
  writeCircuitJson(circuitGenerator);

  if (runTxResult.execResult.exceptionError !== undefined) {
    console.error(`Exception Error: ${runTxResult.execResult.exceptionError}`);
  }
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

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
