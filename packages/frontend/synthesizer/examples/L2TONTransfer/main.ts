// Usage: tsx examples/L2TONTransfer/main.ts <config.json>

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  bytesToBigInt,
  bytesToHex,
  concatBytes,
  hexToBytes,
  setLengthLeft,
  utf8ToBytes,
} from '@ethereumjs/util';
import { jubjub } from '@noble/curves/misc';
import { fromEdwardsToAddress } from '../../src/TokamakL2JS/index.ts';
import { createSynthesizer } from '../../src/synthesizer/index.ts';
import { createCircuitGenerator } from '../../src/circuitGenerator/circuitGenerator.ts';
import { createSynthesizerOptsForSimulationFromRPC, SynthesizerSimulationOpts } from '../../src/interface/index.ts';
import { getUserStorageKey } from '../../src/TokamakL2JS/index.ts';

type L2TONTransferConfig = {
  privateKeySeedsL2: string[];
  addressListL1: `0x${string}`[];
  userStorageSlots: number[];
  initStorageKey: `0x${string}`;
  txNonce: bigint;
  blockNumber: number;
  contractAddress: `0x${string}`;
  amount: `0x${string}`;
  transferSelector: `0x${string}`;
  senderIndex: number;
  recipientIndex: number;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(packageRoot, '.env') });
const RPC_URL_ENV_KEY = 'RPC_URL';

const parseHexString = (value: unknown, label: string): `0x${string}` => {
  if (typeof value !== 'string' || !value.startsWith('0x')) {
    throw new Error(`${label} must be a hex string with 0x prefix`);
  }
  return value as `0x${string}`;
};

const parseBigIntValue = (value: unknown, label: string): bigint => {
  if (typeof value === 'string' || typeof value === 'number') {
    return BigInt(value);
  }
  throw new Error(`${label} must be a string or number`);
};

const parseNumberValue = (value: unknown, label: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer`);
  }
  return parsed;
};

const assertStringArray = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value;
};

const assertNumberArray = (value: unknown, label: string): number[] => {
  if (!Array.isArray(value) || !value.every((entry) => Number.isInteger(entry))) {
    throw new Error(`${label} must be an array of integers`);
  }
  return value;
};

const getRpcUrlFromEnv = (): string => {
  const rpcUrl = process.env[RPC_URL_ENV_KEY];
  if (typeof rpcUrl !== 'string' || rpcUrl.length === 0) {
    throw new Error(`Environment variable ${RPC_URL_ENV_KEY} must be set in ${path.join(packageRoot, '.env')}`);
  }
  return rpcUrl;
};

const loadConfig = async (configPath: string): Promise<L2TONTransferConfig> => {
  const configRaw = JSON.parse(await fs.readFile(configPath, 'utf8'));

  const privateKeySeedsL2 = assertStringArray(configRaw.privateKeySeedsL2, 'privateKeySeedsL2');
  const addressListL1 = assertStringArray(configRaw.addressListL1, 'addressListL1').map((address) => {
    if (!address.startsWith('0x')) {
      throw new Error('addressListL1 entries must be hex strings with 0x prefix');
    }
    return address as `0x${string}`;
  });

  if (privateKeySeedsL2.length !== addressListL1.length) {
    throw new Error('privateKeySeedsL2 and addressListL1 must have the same length');
  }
  if (privateKeySeedsL2.length < 2) {
    throw new Error('privateKeySeedsL2 must include at least sender and recipient seeds');
  }

  return {
    privateKeySeedsL2,
    addressListL1,
    userStorageSlots: assertNumberArray(configRaw.userStorageSlots, 'userStorageSlots'),
    initStorageKey: parseHexString(configRaw.initStorageKey, 'initStorageKey'),
    txNonce: parseBigIntValue(configRaw.txNonce, 'txNonce'),
    blockNumber: parseNumberValue(configRaw.blockNumber, 'blockNumber'),
    contractAddress: parseHexString(configRaw.contractAddress, 'contractAddress'),
    amount: parseHexString(configRaw.amount, 'amount'),
    transferSelector: parseHexString(configRaw.transferSelector, 'transferSelector'),
    senderIndex: parseNumberValue(configRaw.senderIndex, 'senderIndex'),
    recipientIndex: parseNumberValue(configRaw.recipientIndex, 'recipientIndex'),
  };
};

const toSeedBytes = (seed: string) => setLengthLeft(utf8ToBytes(seed), 32);

const main = async () => {
  const configPath = process.argv[2];
  if (!configPath) {
    throw new Error('Config file path required. Usage: tsx examples/L2TONTransfer/main.ts <config.json>');
  }

  const config = await loadConfig(configPath);
  const rpcUrl = getRpcUrlFromEnv();

  const derivedPrivateKeyListL2 = config.privateKeySeedsL2.map((seed) => 
    jubjub.utils.randomPrivateKey(toSeedBytes(seed))
  );

  const derivedPublicKeyListL2 = derivedPrivateKeyListL2.map(prvKey => 
    jubjub.Point.BASE.multiply(bytesToBigInt(prvKey) % jubjub.Point.Fn.ORDER).toBytes()
  );

  const senderL2PrvKey = derivedPrivateKeyListL2[config.senderIndex];
  const tokenRecipientPubKey = derivedPublicKeyListL2[config.recipientIndex];
  const tokenRecipientAddress = fromEdwardsToAddress(tokenRecipientPubKey);

  const callData = concatBytes(
    setLengthLeft(hexToBytes(config.transferSelector), 4),
    setLengthLeft(tokenRecipientAddress.toBytes(), 32),
    setLengthLeft(hexToBytes(config.amount), 32),
  );

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
    txNonce: config.txNonce,
    rpcUrl,
    senderL2PrvKey,
    initStorageKeys,
    blockNumber: config.blockNumber,
    contractAddress: config.contractAddress,
    callData,
  };

  const synthesizerOpts = await createSynthesizerOptsForSimulationFromRPC(simulationOpts);
  const synthesizer = await createSynthesizer(synthesizerOpts);
  const runTxResult = await synthesizer.synthesizeTX();
  const circuitGenerator = await createCircuitGenerator(synthesizer);
  circuitGenerator.writeOutputs();

  console.log(`Sender: ${fromEdwardsToAddress(derivedPublicKeyListL2[0])}`);
  console.log(`Recipent: ${fromEdwardsToAddress(derivedPublicKeyListL2[1])}`);
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
