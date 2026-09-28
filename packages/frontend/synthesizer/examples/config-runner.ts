import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bytesToHex, createAddressFromString, hexToBytes } from '@ethereumjs/util';
import dotenv from 'dotenv';
import { ethers } from 'ethers';
import {
  createTokamakL2Common,
  createStateManagerOptsFromChannelConfig,
  createTokamakL2StateManagerFromL1RPC,
  createTokamakL2Tx,
  type ChannelStateConfig,
  type TokamakL2TxData,
} from 'tokamak-l2js';
import { createCircuitGenerator } from '../core/src/circuit.ts';
import type { SynthesisOutput } from '../core/src/app.ts';
import type { BlockInfo } from '../core/src/synthesizer.ts';
import { createSynthesizer } from '../node-cli/src/synthesizer/constructors.ts';
import { writeSynthesisOutputJson } from '../node-cli/src/io/jsonWriter.ts';
import { installedSubcircuitLibrary } from '../node-cli/src/subcircuit/installedLibrary.ts';
import {
  type DerivedParticipantKeys as SharedDerivedParticipantKeys,
  derivePrivateStateParticipantKeys,
  loadPrivateStateMintConfig,
  loadPrivateStateRedeemConfig,
  loadPrivateStateTransferConfig,
  toPrivateStateMintStateManagerChannelConfig,
  toPrivateStateRedeemStateManagerChannelConfig,
  toPrivateStateTransferStateManagerChannelConfig,
  type ExampleNetwork as PrivateStateExampleNetwork,
  type PrivateStateMintConfig,
  type PrivateStateRedeemConfig,
  type PrivateStateTransferConfig,
} from './privateState/utils.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

type ConfigExampleType =
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
  getChannelTransactionIndex(config: TConfig): number;
  getEntryContractAddress(config: TConfig): `0x${string}`;
};

type ConfigRunnerOptions = {
  outputSupplement: boolean;
};

const ALCHEMY_API_KEY_ENV_KEY = 'ALCHEMY_API_KEY';
const ALCHEMY_RPC_URLS = {
  mainnet: 'https://eth-mainnet.g.alchemy.com/v2/',
  sepolia: 'https://eth-sepolia.g.alchemy.com/v2/',
} as const;
const ANVIL_RPC_URL_ENV_KEY = 'ANVIL_RPC_URL';
const DEFAULT_ANVIL_RPC_URL = 'http://127.0.0.1:8545';

function getRpcUrlFromEnv(
  network: PrivateStateExampleNetwork,
  env: NodeJS.ProcessEnv,
): string {
  if (network === 'anvil') {
    const configuredRpcUrl = env[ANVIL_RPC_URL_ENV_KEY]?.trim();
    return configuredRpcUrl && configuredRpcUrl.length > 0
      ? configuredRpcUrl
      : DEFAULT_ANVIL_RPC_URL;
  }

  const apiKey = env[ALCHEMY_API_KEY_ENV_KEY];
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error(`Environment variable ${ALCHEMY_API_KEY_ENV_KEY} must be set`);
  }

  return `${ALCHEMY_RPC_URLS[network]}${apiKey}`;
}

async function getBlockInfoFromRPC(
  rpcUrl: string,
  blockNumber: number,
  nHashes: number,
): Promise<BlockInfo> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const block = await provider.getBlock(blockNumber, false);

  if (block === null) {
    throw new Error('RPC calls an invalid block');
  }

  const hashes: `0x${string}`[] = new Array<`0x${string}`>(nHashes);
  for (let index = 0; index < nHashes; index += 1) {
    const previousBlock = await provider.getBlock(blockNumber - index - 1, false);
    if (previousBlock === undefined || previousBlock === null) {
      throw new Error(`Can't retrieve a previous block hash. The block is ${previousBlock}.`);
    }
    if (previousBlock.hash === undefined || previousBlock.hash === null) {
      throw new Error(`Can't retrieve a previous block hash. It's ${previousBlock.hash}.`);
    }
    hashes[index] = previousBlock.hash as `0x${string}`;
  }

  return {
    coinBase: block.miner as `0x${string}`,
    timeStamp: `0x${block.timestamp.toString(16)}` as `0x${string}`,
    blockNumber: `0x${block.number.toString(16)}` as `0x${string}`,
    prevRanDao: block.prevRandao == null
      ? `0x${block.difficulty.toString(16)}` as `0x${string}`
      : block.prevRandao as `0x${string}`,
    gasLimit: `0x${block.gasLimit.toString(16)}` as `0x${string}`,
    chainId: `0x${(await provider.getNetwork()).chainId.toString(16)}` as `0x${string}`,
    selfBalance: '0x0' as `0x${string}`,
    prevBlockHashes: hashes,
    baseFee: `0x${(block.baseFeePerGas || 0n).toString(16)}` as `0x${string}`,
  };
}

const configAdapters: Record<ConfigExampleType, ConfigAdapter<any>> = {
  'private-state-mint': {
    loadConfig: loadPrivateStateMintConfig,
    getRpcUrl: (config: PrivateStateMintConfig, env) => getRpcUrlFromEnv(config.network, env),
    deriveParticipantKeys: (config: PrivateStateMintConfig) => derivePrivateStateParticipantKeys(config.participants),
    getSenderIndex: (config: PrivateStateMintConfig) => config.senderIndex,
    buildCalldata: (config: PrivateStateMintConfig) => hexToBytes(config.calldata),
    toStateManagerChannelConfig: toPrivateStateMintStateManagerChannelConfig,
    getChannelTransactionIndex: (config: PrivateStateMintConfig) => config.channelTransactionIndex,
    getEntryContractAddress: (config: PrivateStateMintConfig) => config.function.entryContractAddress,
  },
  'private-state-redeem': {
    loadConfig: loadPrivateStateRedeemConfig,
    getRpcUrl: (config: PrivateStateRedeemConfig, env) => getRpcUrlFromEnv(config.network, env),
    deriveParticipantKeys: (config: PrivateStateRedeemConfig) => derivePrivateStateParticipantKeys(config.participants),
    getSenderIndex: (config: PrivateStateRedeemConfig) => config.senderIndex,
    buildCalldata: (config: PrivateStateRedeemConfig) => hexToBytes(config.calldata),
    toStateManagerChannelConfig: toPrivateStateRedeemStateManagerChannelConfig,
    getChannelTransactionIndex: (config: PrivateStateRedeemConfig) => config.channelTransactionIndex,
    getEntryContractAddress: (config: PrivateStateRedeemConfig) => config.function.entryContractAddress,
  },
  'private-state-transfer': {
    loadConfig: loadPrivateStateTransferConfig,
    getRpcUrl: (config: PrivateStateTransferConfig, env) => getRpcUrlFromEnv(config.network, env),
    deriveParticipantKeys: (config: PrivateStateTransferConfig) => derivePrivateStateParticipantKeys(config.participants),
    getSenderIndex: (config: PrivateStateTransferConfig) => config.senderIndex,
    buildCalldata: (config: PrivateStateTransferConfig) => hexToBytes(config.calldata),
    toStateManagerChannelConfig: toPrivateStateTransferStateManagerChannelConfig,
    getChannelTransactionIndex: (config: PrivateStateTransferConfig) => config.channelTransactionIndex,
    getEntryContractAddress: (config: PrivateStateTransferConfig) => config.function.entryContractAddress,
  },
};

async function runConfigExample<TConfig>(
  adapter: ConfigAdapter<TConfig>,
  configPath: string,
  options: ConfigRunnerOptions,
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
  const stateManagerChannelConfig = adapter.toStateManagerChannelConfig(config);
  const stateManagerOpts = createStateManagerOptsFromChannelConfig(stateManagerChannelConfig);
  const stateManager = await createTokamakL2StateManagerFromL1RPC(rpcUrl, stateManagerOpts);
  const blockNumber = stateManagerChannelConfig.blockNumber;
  const blockInfo = await getBlockInfoFromRPC(
    rpcUrl,
    blockNumber,
    installedSubcircuitLibrary.numberOfPrevBlockHashes,
  );

  const txData: TokamakL2TxData = {
    channelTransactionIndex: BigInt(adapter.getChannelTransactionIndex(config)),
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
  const finalStateSnapshot = await stateManager.captureStateSnapshot();
  const circuitGeneration = await createCircuitGenerator(synthesizer);
  const output: SynthesisOutput = {
    ...circuitGeneration,
    finalStateSnapshot,
    evmAnalysis: {
      stepLogs: synthesizer.stepLogs,
      messageCodeAddresses: synthesizer.messageCodeAddresses.slice(),
    },
  };
  writeSynthesisOutputJson(output, undefined, {
    outputSupplement: options.outputSupplement,
  });

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
  const args = process.argv.slice(2);
  const outputSupplement = args.includes('--output-supplement');
  const positionalArgs = args.filter((arg) => arg !== '--output-supplement');
  const unsupportedOption = positionalArgs.find((arg) => arg.startsWith('--'));

  if (unsupportedOption !== undefined) {
    throw new Error(`Unsupported option: ${unsupportedOption}`);
  }

  const exampleType = positionalArgs[0] as ConfigExampleType | undefined;
  const configPath = positionalArgs[1];

  if (exampleType === undefined || !(exampleType in configAdapters)) {
    throw new Error(
      'Example type required. Usage: tsx examples/config-runner.ts <private-state-mint|private-state-redeem|private-state-transfer> <config.json> [--output-supplement]',
    );
  }
  if (configPath === undefined) {
    throw new Error(
      'Config file path required. Usage: tsx examples/config-runner.ts <example-type> <config.json> [--output-supplement]',
    );
  }

  await runConfigExample(configAdapters[exampleType], configPath, { outputSupplement });
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
