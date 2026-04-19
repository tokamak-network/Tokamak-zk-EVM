import { bytesToHex, createAddressFromString, hexToBytes } from '@ethereumjs/util';
import {
  createTokamakL2Common,
  createStateManagerOptsFromChannelConfig,
  createTokamakL2StateManagerFromL1RPC,
  createTokamakL2Tx,
  type ChannelStateConfig,
  type TokamakL2TxData,
} from 'tokamak-l2js';
import { createCircuitGenerator } from '../../core/src/circuit.ts';
import { createSynthesizer } from '../src/synthesizer/constructors.ts';
import { writeCircuitJson, writeEvmAnalysisJson } from '../src/io/jsonWriter.ts';
import { getBlockInfoFromRPC } from '../src/rpc/index.ts';
import { installedSubcircuitLibrary } from '../src/subcircuit/installedLibrary.ts';
import { loadSubcircuitWasm } from '../src/subcircuit/wasmLoader.ts';
import {
  buildErc20Calldata,
  deriveParticipantKeys as deriveErc20ParticipantKeys,
  getExampleRpcUrl as getErc20RpcUrl,
  loadConfig as loadErc20Config,
  toStateManagerChannelConfig as toErc20StateManagerChannelConfig,
  type ExampleErc20TransferConfig,
} from './erc20Transfers/utils.ts';
import {
  buildPrivateStateMintCalldata,
  buildPrivateStateRedeemCalldata,
  buildPrivateStateTransferCalldata,
  type DerivedParticipantKeys as SharedDerivedParticipantKeys,
  derivePrivateStateParticipantKeys,
  getPrivateStateExampleRpcUrl,
  loadPrivateStateMintConfig,
  loadPrivateStateRedeemConfig,
  loadPrivateStateTransferConfig,
  toPrivateStateMintStateManagerChannelConfig,
  toPrivateStateRedeemStateManagerChannelConfig,
  toPrivateStateTransferStateManagerChannelConfig,
  type PrivateStateMintConfig,
  type PrivateStateRedeemConfig,
  type PrivateStateTransferConfig,
} from './privateState/utils.ts';

type ConfigExampleType =
  | 'erc20-transfer'
  | 'private-state-mint'
  | 'private-state-redeem'
  | 'private-state-transfer';

type ConfigAdapter<TConfig> = {
  loadConfig(configPath: string): Promise<TConfig>;
  getRpcUrl(config: TConfig, env: NodeJS.ProcessEnv): string;
  deriveParticipantKeys(config: TConfig): SharedDerivedParticipantKeys;
  getSenderIndex(config: TConfig): number;
  buildCalldata(config: TConfig, keyMaterial: SharedDerivedParticipantKeys): Uint8Array;
  toStateManagerChannelConfig(config: TConfig): ChannelStateConfig;
  getTxNonce(config: TConfig): number;
  getEntryContractAddress(config: TConfig): `0x${string}`;
  allowAnalysisOnly?: boolean;
};

const configAdapters: Record<ConfigExampleType, ConfigAdapter<any>> = {
  'erc20-transfer': {
    loadConfig: loadErc20Config,
    getRpcUrl: (config: ExampleErc20TransferConfig, env) => getErc20RpcUrl(config.network, env),
    deriveParticipantKeys: (config: ExampleErc20TransferConfig) => deriveErc20ParticipantKeys(config.participants),
    getSenderIndex: (config: ExampleErc20TransferConfig) => config.senderIndex,
    buildCalldata: (config: ExampleErc20TransferConfig, keyMaterial) => buildErc20Calldata(config, keyMaterial),
    toStateManagerChannelConfig: toErc20StateManagerChannelConfig,
    getTxNonce: (config: ExampleErc20TransferConfig) => config.txNonce,
    getEntryContractAddress: (config: ExampleErc20TransferConfig) => config.function.entryContractAddress,
  },
  'private-state-mint': {
    loadConfig: loadPrivateStateMintConfig,
    getRpcUrl: (config: PrivateStateMintConfig, env) => getPrivateStateExampleRpcUrl(config.network, env),
    deriveParticipantKeys: (config: PrivateStateMintConfig) => derivePrivateStateParticipantKeys(config.participants),
    getSenderIndex: (config: PrivateStateMintConfig) => config.senderIndex,
    buildCalldata: (config: PrivateStateMintConfig) => hexToBytes(config.calldata),
    toStateManagerChannelConfig: toPrivateStateMintStateManagerChannelConfig,
    getTxNonce: (config: PrivateStateMintConfig) => config.txNonce,
    getEntryContractAddress: (config: PrivateStateMintConfig) => config.function.entryContractAddress,
    allowAnalysisOnly: true,
  },
  'private-state-redeem': {
    loadConfig: loadPrivateStateRedeemConfig,
    getRpcUrl: (config: PrivateStateRedeemConfig, env) => getPrivateStateExampleRpcUrl(config.network, env),
    deriveParticipantKeys: (config: PrivateStateRedeemConfig) => derivePrivateStateParticipantKeys(config.participants),
    getSenderIndex: (config: PrivateStateRedeemConfig) => config.senderIndex,
    buildCalldata: (config: PrivateStateRedeemConfig) => hexToBytes(config.calldata),
    toStateManagerChannelConfig: toPrivateStateRedeemStateManagerChannelConfig,
    getTxNonce: (config: PrivateStateRedeemConfig) => config.txNonce,
    getEntryContractAddress: (config: PrivateStateRedeemConfig) => config.function.entryContractAddress,
    allowAnalysisOnly: true,
  },
  'private-state-transfer': {
    loadConfig: loadPrivateStateTransferConfig,
    getRpcUrl: (config: PrivateStateTransferConfig, env) => getPrivateStateExampleRpcUrl(config.network, env),
    deriveParticipantKeys: (config: PrivateStateTransferConfig) => derivePrivateStateParticipantKeys(config.participants),
    getSenderIndex: (config: PrivateStateTransferConfig) => config.senderIndex,
    buildCalldata: (config: PrivateStateTransferConfig) => hexToBytes(config.calldata),
    toStateManagerChannelConfig: toPrivateStateTransferStateManagerChannelConfig,
    getTxNonce: (config: PrivateStateTransferConfig) => config.txNonce,
    getEntryContractAddress: (config: PrivateStateTransferConfig) => config.function.entryContractAddress,
    allowAnalysisOnly: true,
  },
};

async function runConfigExample<TConfig>(
  adapter: ConfigAdapter<TConfig>,
  configPath: string,
): Promise<void> {
  const config = await adapter.loadConfig(configPath);
  const rpcUrl = adapter.getRpcUrl(config, process.env);
  const keyMaterial = adapter.deriveParticipantKeys(config);
  const senderIndex = adapter.getSenderIndex(config);
  const senderL2PrvKey = keyMaterial.privateKeys[senderIndex];
  const senderPubKey = keyMaterial.publicKeys[senderIndex];

  if (senderL2PrvKey === undefined || senderPubKey === undefined) {
    throw new Error(`senderIndex must point to an existing participant; got ${senderIndex}`);
  }

  const callData = adapter.buildCalldata(config, keyMaterial);
  const common = createTokamakL2Common();
  const stateManagerOpts = createStateManagerOptsFromChannelConfig(
    adapter.toStateManagerChannelConfig(config),
  );
  const stateManager = await createTokamakL2StateManagerFromL1RPC(rpcUrl, stateManagerOpts);
  const blockNumber = adapter.toStateManagerChannelConfig(config).blockNumber;
  const blockInfo = await getBlockInfoFromRPC(
    rpcUrl,
    blockNumber,
    installedSubcircuitLibrary.numberOfPrevBlockHashes,
  );

  const txData: TokamakL2TxData = {
    nonce: BigInt(adapter.getTxNonce(config)),
    to: createAddressFromString(adapter.getEntryContractAddress(config)),
    data: callData,
    senderPubKey: senderPubKey.toBytes(),
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

  if (!(adapter.allowAnalysisOnly && process.env.PRIVATE_STATE_ANALYSIS_ONLY === '1')) {
    const subcircuitBuffers = loadSubcircuitWasm();
    const circuitGenerator = await createCircuitGenerator(synthesizer, subcircuitBuffers);
    writeCircuitJson(circuitGenerator);
  }

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
}

async function main(): Promise<void> {
  const exampleType = process.argv[2] as ConfigExampleType | undefined;
  const configPath = process.argv[3];

  if (exampleType === undefined || !(exampleType in configAdapters)) {
    throw new Error(
      'Example type required. Usage: tsx examples/config-runner.ts <erc20-transfer|private-state-mint|private-state-redeem|private-state-transfer> <config.json>',
    );
  }
  if (configPath === undefined) {
    throw new Error(
      'Config file path required. Usage: tsx examples/config-runner.ts <example-type> <config.json>',
    );
  }

  await runConfigExample(configAdapters[exampleType], configPath);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
