#!/usr/bin/env node
/* eslint-disable no-console */

import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { ethers } from 'ethers';
import { fileURLToPath } from 'url';
import { fromEdwardsToAddress } from 'tokamak-l2js';
import { BLS12831ARITHMODULUS } from '../src/synthesizer/params/index.ts';
import {
  buildPrivateStateRedeemCalldata,
  deriveParticipantKeys,
  redeemInterfaces,
  type PrivateStateRedeemConfig,
} from '../examples/privateStateRedeem/utils.ts';
import {
  computeReplayPrivateStateMappingKey,
  computeReplayPrivateStateNoteCommitment,
} from './private-state-hash.ts';

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
const repoRoot = path.resolve(packageRoot, '..', '..', '..', '..', '..');
const scriptsEnvPath = path.resolve(__dirname, '.env');
const packageEnvPath = path.resolve(packageRoot, '.env');
const defaultOutputPath = path.resolve(packageRoot, 'scripts', 'private-state-redeem-config.json');
const deploymentManifestPath = path.resolve(repoRoot, 'apps', 'private-state', 'deploy', 'deployment.31337.latest.json');
const privateStateAppDir = path.resolve(repoRoot, 'apps', 'private-state');

const DEFAULT_ANVIL_RPC_URL = 'http://127.0.0.1:8545';
const DEFAULT_ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
const DEFAULT_PARTICIPANT_COUNT = 4;
const DEFAULT_NOTE_VALUE = 1n * 10n ** 18n;
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
  receiver?: number;
  inputs: 1 | 2 | 3 | 4;
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

const parseAmount = (value: unknown): bigint => {
  if (value === undefined || value === '') {
    return DEFAULT_NOTE_VALUE;
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
    inputs: 4,
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
      case '--receiver':
      case '-r':
        args.receiver = parseInteger(consumeValue(current), 'receiver');
        break;
      case '--inputs':
      case '-n': {
        const inputCount = parseInteger(consumeValue(current), 'inputs');
        if (inputCount !== 1 && inputCount !== 2 && inputCount !== 3 && inputCount !== 4) {
          throw new Error('inputs must be 1, 2, 3, or 4');
        }
        args.inputs = inputCount;
        break;
      }
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

const writeConfig = async (targetPath: string, config: PrivateStateRedeemConfig) => {
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
        `Run: make -C ${privateStateAppDir} anvil-bootstrap`,
      ].join('\n'),
    );
  }
};

const toSalt = (label: string): `0x${string}` =>
  ethers.toBeHex(
    BigInt(ethers.keccak256(ethers.toUtf8Bytes(label))) % BLS12831ARITHMODULUS,
    32,
  ) as `0x${string}`;

const main = async () => {
  const args = parseArgs();
  const outputPath = args.output ? path.resolve(process.cwd(), String(args.output)) : defaultOutputPath;
  const participantCount = args.participants;
  const senderIndex = args.sender;
  const receiverIndex = args.receiver ?? ((senderIndex + 1) % participantCount);
  const inputCount = args.inputs;
  const noteValue = parseAmount(args.amount);
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
  if (receiverIndex < 0 || receiverIndex >= participantCount) {
    throw new Error(`receiver must be between 0 and ${participantCount - 1}`);
  }

  await ensurePrivateStateBootstrap();
  const manifest = await loadDeploymentManifest();
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const baseParticipants = buildParticipants(mnemonic, participantCount);
  const keyMaterial = deriveParticipantKeys(baseParticipants);
  const participants = baseParticipants.map((participant, index) => ({
    ...participant,
    addressL1: fromEdwardsToAddress(keyMaterial.publicKeys[index]).toString() as `0x${string}`,
  }));

  const senderAddress = participants[senderIndex]?.addressL1;
  const receiverAddress = participants[receiverIndex]?.addressL1;
  if (!senderAddress || !receiverAddress) {
    throw new Error('Could not resolve redeem participants');
  }

  const functionName = `redeemNotes${inputCount}` as
    | 'redeemNotes1'
    | 'redeemNotes2'
    | 'redeemNotes3'
    | 'redeemNotes4';
  const redeemInterface = redeemInterfaces[inputCount];
  const selector = redeemInterface.getFunction(functionName)?.selector as `0x${string}` | undefined;
  if (!selector) {
    throw new Error(`Failed to resolve ${functionName} selector`);
  }

  const inputValueHex = ethers.toBeHex(noteValue) as `0x${string}`;
  const inputNotes = Array.from({length: inputCount}, (_, index) => ({
    owner: senderAddress,
    value: inputValueHex,
    salt: toSalt(`private-state-redeem-input-sender-${senderIndex}-${index}`),
  })) as PrivateStateRedeemConfig['inputNotes'];

  const config: PrivateStateRedeemConfig = {
    network: 'anvil',
    participants,
    storageConfigs: [],
    callCodeAddresses: [],
    blockNumber: 0,
    txNonce: DEFAULT_L2_TX_NONCE,
    calldata: '0x',
    senderIndex,
    receiverIndex,
    inputCount,
    inputNotes,
    function: {
      selector,
      entryContractAddress: manifest.contracts.controller,
    },
  };
  config.calldata = buildPrivateStateRedeemCalldata(config, keyMaterial);

  const truthyValue = ethers.zeroPadValue('0x01', 32);

  const inputCommitments: `0x${string}`[] = [];

  for (const note of inputNotes) {
    const commitment = computeReplayPrivateStateNoteCommitment(note);
    inputCommitments.push(commitment);

    const noteRegistryKey = computeReplayPrivateStateMappingKey(commitment, 0);
    await provider.send('anvil_setStorageAt', [manifest.contracts.controller, noteRegistryKey, truthyValue]);
  }

  await provider.send('evm_mine', []);
  const blockNumber = await provider.getBlockNumber();

  const noteRegistryKeys = inputCommitments.map((commitment) =>
    computeReplayPrivateStateMappingKey(commitment, 0));
  config.blockNumber = blockNumber;
  config.storageConfigs = [
    {
      address: manifest.contracts.controller,
      userStorageSlots: [],
      preAllocatedKeys: mergeUniqueHexValues([], noteRegistryKeys),
    },
    {
      address: manifest.contracts.l2AccountingVault,
      userStorageSlots: [0],
      preAllocatedKeys: [],
    },
  ];
  config.callCodeAddresses = [manifest.contracts.controller, manifest.contracts.l2AccountingVault];

  await writeConfig(outputPath, config);
  console.log(`Saved private-state redeem config to ${outputPath}`);
};

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
