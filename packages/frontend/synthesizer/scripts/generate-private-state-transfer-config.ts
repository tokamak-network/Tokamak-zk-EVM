#!/usr/bin/env node
/* eslint-disable no-console */

import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { ethers } from 'ethers';
import { fileURLToPath } from 'url';
import { fromEdwardsToAddress } from 'tokamak-l2js';
import {
  buildPrivateStateTransferCalldata,
  createTransferInterface,
  deriveParticipantKeys,
  isSupportedTransferArity,
  type PrivateStateNote,
  type PrivateStateTransferOutput,
  type PrivateStateTransferConfig,
} from '../examples/privateState/transferNotes/utils.ts';
import {
  computeReplayPrivateStateEncryptedNoteSalt,
  computeReplayPrivateStateMappingKey,
  computeReplayPrivateStateNoteCommitment,
  computeReplayPrivateStateNullifier,
  deriveReplayPrivateStateFieldValue,
  getPrivateStateManagedStorageAddresses,
  getPrivateStateControllerCommitmentExistsSlot,
  loadPrivateStateStorageLayoutManifest,
} from './utils/private-state.ts';

type ParticipantEntry = {
  addressL1: `0x${string}`;
  prvSeedL2: string;
};

type StorageConfigEntry = {
  address: `0x${string}`;
  userStorageSlots: number[];
  preAllocatedKeys: `0x${string}`[];
};

type DeploymentManifest = {
  chainId: number;
  contracts: {
    controller: `0x${string}`;
    l2AccountingVault: `0x${string}`;
  };
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const scriptsEnvPath = path.resolve(__dirname, '.env');
const packageEnvPath = path.resolve(packageRoot, '.env');
const defaultOutputPath = path.resolve(packageRoot, 'scripts', 'private-state-transfer-config.json');
const deploymentManifestPath = path.resolve(packageRoot, 'scripts', 'deployment', 'private-state', 'deployment.31337.latest.json');
const DEFAULT_ANVIL_RPC_URL = 'http://127.0.0.1:8545';
const DEFAULT_ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
const DEFAULT_PARTICIPANT_COUNT = 4;
const DEFAULT_AMOUNT_UNIT = 10n ** 18n;
const DEFAULT_L2_TX_NONCE = 0;

const applyEnvFileIfPresent = (targetPath: string) => {
  try {
    const contents = fsSync.readFileSync(targetPath, 'utf8');
    for (const rawLine of contents.split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith('#')) {
        continue;
      }
      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/gu, '');
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
};

applyEnvFileIfPresent(scriptsEnvPath);
applyEnvFileIfPresent(packageEnvPath);

type ParsedArgs = {
  output?: string;
  participants: number;
  sender: number;
  toAccounts?: number[];
  extraCommitments: number;
  saltLabel?: string;
  inputCount: number;
  outputCount: number;
  rpcUrl?: string;
  mnemonic?: string;
  amount?: string;
};

const parseInteger = (value: unknown, label: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer`);
  }
  return parsed;
};

const gcd = (left: bigint, right: bigint): bigint => {
  let a = left;
  let b = right;
  while (b !== 0n) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a;
};

const lcm = (left: bigint, right: bigint): bigint => (left / gcd(left, right)) * right;

const defaultTransferValue = (inputCount: number, outputCount: number): bigint =>
  lcm(BigInt(inputCount), BigInt(outputCount)) * DEFAULT_AMOUNT_UNIT;

const parseAmount = (value: unknown, fallback: bigint): bigint => {
  if (value === undefined || value === '') {
    return fallback;
  }
  if (typeof value !== 'string') {
    throw new Error('amount must be a string');
  }
  const trimmed = value.trim();
  if (trimmed.startsWith('0x')) {
    return BigInt(trimmed);
  }
  return BigInt(trimmed);
};

const parseArgs = (): ParsedArgs => {
  const args: ParsedArgs = {
    participants: DEFAULT_PARTICIPANT_COUNT,
    sender: 0,
    extraCommitments: 0,
    inputCount: 1,
    outputCount: 2,
  };
  const argv = process.argv.slice(2);

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current?.startsWith('-')) {
      throw new Error(`Unexpected positional argument: ${current}`);
    }

    const next = argv[index + 1];
    const consumeValue = (label: string) => {
      if (!next || next.startsWith('-')) {
        throw new Error(`Missing value for ${label}`);
      }
      index += 1;
      return next;
    };

    switch (current) {
      case '--output':
      case '-o':
        args.output = consumeValue(current);
        break;
      case '--participants':
      case '-p':
        args.participants = parseInteger(consumeValue(current), 'participants');
        break;
      case '--sender':
      case '-s':
        args.sender = parseInteger(consumeValue(current), 'sender');
        break;
      case '--to-accounts': {
        const rawValue = consumeValue(current);
        args.toAccounts = rawValue.split(',').map((value) => parseInteger(value.trim(), 'to-accounts'));
        break;
      }
      case '--extra-commitments':
        args.extraCommitments = parseInteger(consumeValue(current), 'extra-commitments');
        break;
      case '--salt-label':
        args.saltLabel = consumeValue(current);
        break;
      case '--inputs':
      case '-i':
        args.inputCount = parseInteger(consumeValue(current), 'inputs');
        break;
      case '--outputs':
      case '-m':
        args.outputCount = parseInteger(consumeValue(current), 'outputs');
        break;
      case '--rpc-url':
        args.rpcUrl = consumeValue(current);
        break;
      case '--mnemonic':
        args.mnemonic = consumeValue(current);
        break;
      case '--amount':
      case '-a':
        args.amount = consumeValue(current);
        break;
      default:
        throw new Error(`Unknown argument: ${current}`);
    }
  }

  return args;
};

const buildParticipants = (mnemonic: string, participantCount: number): ParticipantEntry[] => {
  const participants: ParticipantEntry[] = [];
  for (let index = 0; index < participantCount; index += 1) {
    const wallet = ethers.HDNodeWallet.fromPhrase(
      mnemonic,
      undefined,
      `m/44'/60'/0'/0/${index}`,
    );
    participants.push({
      addressL1: wallet.address as `0x${string}`,
      prvSeedL2: `private-state participant ${index}`,
    });
  }
  return participants;
};

const writeConfig = async (targetPath: string, config: PrivateStateTransferConfig) => {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
};

const mergeUniqueHexValues = (existing: `0x${string}`[], incoming: `0x${string}`[]) => {
  const seen = new Set<string>();
  const merged: `0x${string}`[] = [];
  for (const value of [...existing, ...incoming]) {
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    merged.push(value);
  }
  return merged;
};

const loadDeploymentManifest = async (): Promise<DeploymentManifest> => {
  const contents = await fs.readFile(deploymentManifestPath, 'utf8');
  return JSON.parse(contents) as DeploymentManifest;
};

const ensurePrivateStateBootstrap = async () => {
  try {
    await fs.access(deploymentManifestPath);
  } catch {
    throw new Error(
      [
        'Missing private-state deployment manifest for anvil.',
        `Expected: ${deploymentManifestPath}`,
        'Refresh the mirrored private-state deployment artifacts before running this script.',
      ].join('\n'),
    );
  }
};

const toFieldValue = (label: string): `0x${string}` => deriveReplayPrivateStateFieldValue(label);

const toEncryptedNoteValue = (label: string): [`0x${string}`, `0x${string}`, `0x${string}`] => [
  toFieldValue(`${label}:word0`),
  toFieldValue(`${label}:word1`),
  toFieldValue(`${label}:word2`),
];

const main = async () => {
  const args = parseArgs();
  const outputPath = args.output ? path.resolve(process.cwd(), String(args.output)) : defaultOutputPath;
  const participantCount = args.participants;
  const senderIndex = args.sender;
  const toAccounts = args.toAccounts;
  const extraCommitments = args.extraCommitments;
  const saltLabel = args.saltLabel?.trim() ?? '';
  const inputCount = args.inputCount;
  const outputCount = args.outputCount;
  const rpcUrl = typeof args.rpcUrl === 'string' && args.rpcUrl.trim().length > 0
    ? args.rpcUrl.trim()
    : process.env.ANVIL_RPC_URL?.trim() || DEFAULT_ANVIL_RPC_URL;
  const mnemonic = typeof args.mnemonic === 'string' && args.mnemonic.trim().length > 0
    ? args.mnemonic.trim()
    : process.env.APPS_ANVIL_MNEMONIC?.trim() || DEFAULT_ANVIL_MNEMONIC;

  if (participantCount < 2) {
    throw new Error('participants must be >= 2');
  }
  if (senderIndex < 0 || senderIndex >= participantCount) {
    throw new Error(`sender must be between 0 and ${participantCount - 1}`);
  }
  if (extraCommitments < 0) {
    throw new Error('extra-commitments must be >= 0');
  }
  if (inputCount < 1 || inputCount > 8) {
    throw new Error('inputs must be between 1 and 8');
  }
  if (outputCount < 1 || outputCount > 3) {
    throw new Error('outputs must be 1, 2, or 3');
  }
  if (!isSupportedTransferArity(inputCount, outputCount)) {
    throw new Error('private-state transfer configs only support N<=4 for To1, N<=3 for To2, and only 1->3 for To3');
  }
  if (toAccounts !== undefined) {
    if (toAccounts.length !== outputCount) {
      throw new Error(`to-accounts must provide exactly ${outputCount} account indices`);
    }
    for (const accountIndex of toAccounts) {
      if (accountIndex < 0 || accountIndex >= participantCount) {
        throw new Error(`to-accounts entries must be between 0 and ${participantCount - 1}`);
      }
    }
  }

  const noteValue = parseAmount(args.amount, defaultTransferValue(inputCount, outputCount));

  await ensurePrivateStateBootstrap();
  const manifest = await loadDeploymentManifest();
  const storageLayoutManifest = await loadPrivateStateStorageLayoutManifest();
  const managedStorageAddresses = getPrivateStateManagedStorageAddresses(storageLayoutManifest);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const baseParticipants = buildParticipants(mnemonic, participantCount);
  const keyMaterial = deriveParticipantKeys(baseParticipants);
  const participants = baseParticipants.map((participant, index) => ({
    ...participant,
    addressL1: fromEdwardsToAddress(keyMaterial.publicKeys[index]).toString() as `0x${string}`,
  }));

  const senderAddress = participants[senderIndex]?.addressL1;
  const recipientOneIndex = (senderIndex + 1) % participantCount;
  const recipientOneAddress = participants[recipientOneIndex]?.addressL1;
  const recipientTwoIndex = (senderIndex + 2) % participantCount;
  const recipientTwoAddress = participants[recipientTwoIndex]?.addressL1;
  if (!senderAddress || !recipientOneAddress || !recipientTwoAddress) {
    throw new Error('Could not resolve transfer participants');
  }

  const functionName = `transferNotes${inputCount}To${outputCount}`;
  const transferInterface = createTransferInterface(inputCount, outputCount);
  const selector = transferInterface.getFunction(functionName)?.selector as `0x${string}` | undefined;
  if (!selector) {
    throw new Error(`Failed to resolve ${functionName} selector`);
  }

  const inputValue = noteValue / BigInt(inputCount);
  if (inputValue === 0n || inputValue * BigInt(inputCount) !== noteValue) {
    throw new Error('total transfer note value must be divisible by the input count and greater than zero');
  }
  const outputValue = noteValue / BigInt(outputCount);
  if (outputValue === 0n || outputValue * BigInt(outputCount) !== noteValue) {
    throw new Error('total transfer note value must be divisible by the output count and greater than zero');
  }
  const inputValueHex = ethers.toBeHex(inputValue) as `0x${string}`;
  const outputValueHex = ethers.toBeHex(outputValue) as `0x${string}`;
  const inputNotes = Array.from({ length: inputCount }, (_, index) => ({
    owner: senderAddress,
    value: inputValueHex,
    salt: toFieldValue(`private-state-transfer-input-sender-${senderIndex}-${inputCount}-${outputCount}-${saltLabel}-${index}`),
  })) as PrivateStateTransferConfig['inputNotes'];
  const defaultOutputOwners = outputCount === 1
    ? [recipientOneAddress]
    : outputCount === 2
      ? [recipientOneAddress, senderAddress]
      : [recipientOneAddress, senderAddress, recipientTwoAddress];
  const outputOwners = toAccounts === undefined
    ? defaultOutputOwners
    : toAccounts.map((accountIndex) => {
      const accountAddress = participants[accountIndex]?.addressL1;
      if (!accountAddress) {
        throw new Error(`Could not resolve toAccount at index ${accountIndex}`);
      }
      return accountAddress;
    });
  const transferOutputs = outputOwners.map((owner, index) => ({
    owner,
    value: outputValueHex,
    encryptedNoteValue: toEncryptedNoteValue(
      `private-state-transfer-output-sender-${senderIndex}-${inputCount}-${outputCount}-${saltLabel}-${index}`,
    ),
  })) as PrivateStateTransferOutput[];
  const outputNotes = transferOutputs.map((output) => ({
    owner: output.owner,
    value: output.value,
    salt: computeReplayPrivateStateEncryptedNoteSalt(output.encryptedNoteValue),
  })) as PrivateStateTransferConfig['outputNotes'];

  const config: PrivateStateTransferConfig = {
    network: 'anvil',
    participants,
    storageConfigs: [],
    callCodeAddresses: [],
    blockNumber: 0,
    txNonce: DEFAULT_L2_TX_NONCE,
    calldata: '0x',
    senderIndex,
    functionName,
    inputCount,
    outputCount,
    inputNotes,
    transferOutputs,
    outputNotes,
    function: {
      selector,
      entryContractAddress: manifest.contracts.controller,
    },
  };
  config.calldata = buildPrivateStateTransferCalldata(config, keyMaterial);

  const truthyValue = ethers.zeroPadValue('0x01', 32);
  const commitmentExistsSlot = getPrivateStateControllerCommitmentExistsSlot(storageLayoutManifest);

  const inputCommitments: `0x${string}`[] = [];

  for (const note of inputNotes) {
    const commitment = computeReplayPrivateStateNoteCommitment(note);
    inputCommitments.push(commitment);

    const noteRegistryKey = computeReplayPrivateStateMappingKey(commitment, commitmentExistsSlot);
    await provider.send('anvil_setStorageAt', [manifest.contracts.controller, noteRegistryKey, truthyValue]);
  }

  for (let index = 0; index < extraCommitments; index += 1) {
    const dormantNote: PrivateStateNote = {
      owner: senderAddress,
      value: inputValueHex,
      salt: toFieldValue(`private-state-transfer-dormant-sender-${senderIndex}-${inputCount}-${outputCount}-${saltLabel}-${index}`),
    };
    const commitment = computeReplayPrivateStateNoteCommitment(dormantNote);
    inputCommitments.push(commitment);
    const noteRegistryKey = computeReplayPrivateStateMappingKey(commitment, commitmentExistsSlot);
    await provider.send('anvil_setStorageAt', [manifest.contracts.controller, noteRegistryKey, truthyValue]);
  }

  await provider.send('evm_mine', []);
  const blockNumber = await provider.getBlockNumber();

  const noteRegistryKeys = inputCommitments.map((commitment) =>
    computeReplayPrivateStateMappingKey(commitment, commitmentExistsSlot));

  config.blockNumber = blockNumber;
  config.storageConfigs = managedStorageAddresses.map((address) => ({
    address,
    userStorageSlots: [],
    preAllocatedKeys: address.toLowerCase() === manifest.contracts.controller.toLowerCase()
      ? mergeUniqueHexValues([], noteRegistryKeys)
      : [],
  }));
  config.callCodeAddresses = managedStorageAddresses;

  await writeConfig(outputPath, config);
  console.log(`Saved private-state transfer config to ${outputPath}`);
};

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
