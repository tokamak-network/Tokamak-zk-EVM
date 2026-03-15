#!/usr/bin/env node
/* eslint-disable no-console */

import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { ethers } from 'ethers';
import { fileURLToPath } from 'url';
import { fromEdwardsToAddress } from 'tokamak-l2js';
import {
  deriveParticipantKeys,
  mintNotes1Interface,
} from '../examples/privateStateMint/utils.ts';

type ParticipantEntry = {
  addressL1: `0x${string}`;
  prvSeedL2: string;
};

type StorageConfigEntry = {
  address: `0x${string}`;
  userStorageSlots: number[];
  preAllocatedKeys: `0x${string}`[];
};

type PrivateStateMintConfig = {
  network: 'anvil';
  participants: ParticipantEntry[];
  storageConfigs: StorageConfigEntry[];
  entryContractAddress: `0x${string}`;
  callCodeAddresses: `0x${string}`[];
  blockNumber: number;
  txNonce: number;
  senderIndex: number;
  noteOwnerIndex: number;
  noteValue: `0x${string}`;
  noteSalt: `0x${string}`;
  function: {
    selector: `0x${string}`;
    entryContractAddress: `0x${string}`;
  };
};

type DeploymentManifest = {
  contracts: {
    controller: `0x${string}`;
    l2AccountingVault: `0x${string}`;
    noteRegistry: `0x${string}`;
    nullifierRegistry: `0x${string}`;
  };
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..', '..', '..', '..');
const scriptsEnvPath = path.resolve(__dirname, '.env');
const packageEnvPath = path.resolve(packageRoot, '.env');
const defaultOutputPath = path.resolve(packageRoot, 'scripts', 'private-state-mint-config.json');
const deploymentManifestPath = path.resolve(repoRoot, 'apps', 'private-state', 'deploy', 'deployment.31337.latest.json');
const privateStateAppDir = path.resolve(repoRoot, 'apps', 'private-state');

const DEFAULT_ANVIL_RPC_URL = 'http://127.0.0.1:8545';
const DEFAULT_ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
const DEFAULT_PARTICIPANT_COUNT = 4;
const DEFAULT_NOTE_VALUE = 1n * 10n ** 18n;
const DEFAULT_NOTE_OWNER_INDEX = -1;
const MAX_255_BIT_VALUE = (1n << 255n) - 1n;
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
  noteOwner: number;
  rpcUrl?: string;
  mnemonic?: string;
  amount?: string;
};

const parseArgs = (): ParsedArgs => {
  const args: ParsedArgs = {
    participants: DEFAULT_PARTICIPANT_COUNT,
    sender: 0,
    noteOwner: DEFAULT_NOTE_OWNER_INDEX,
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
      case '--note-owner':
        args.noteOwner = parseInteger(consumeValue(current), 'note-owner');
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

const writeConfig = async (targetPath: string, config: PrivateStateMintConfig) => {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
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

const main = async () => {
  const args = parseArgs();
  const outputPath = args.output
    ? path.resolve(process.cwd(), String(args.output))
    : defaultOutputPath;
  const participantCount = args.participants;
  const senderIndex = args.sender;
  const rawNoteOwnerIndex = args.noteOwner;
  const noteOwnerIndex = rawNoteOwnerIndex === DEFAULT_NOTE_OWNER_INDEX ? senderIndex : rawNoteOwnerIndex;
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
  if (noteOwnerIndex < 0 || noteOwnerIndex >= participantCount) {
    throw new Error(`note-owner must be between 0 and ${participantCount - 1}`);
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
  const noteOwner = participants[noteOwnerIndex]?.addressL1;
  if (!senderAddress) {
    throw new Error(`Could not resolve sender at index ${senderIndex}`);
  }
  if (!noteOwner) {
    throw new Error(`Could not resolve note owner at index ${noteOwnerIndex}`);
  }

  const controllerInterface = new ethers.Interface([
    'function computeNoteCommitment(uint256 value, address owner, bytes32 salt) view returns (bytes32)',
  ]);
  const controller = new ethers.Contract(
    manifest.contracts.controller,
    controllerInterface,
    provider,
  );

  const noteSalt =
    ethers.toBeHex(
      BigInt(
        ethers.keccak256(
          ethers.toUtf8Bytes(`private-state-mint-sender-${senderIndex}-owner-${noteOwnerIndex}`),
        ),
      ) & MAX_255_BIT_VALUE,
      32,
    ) as `0x${string}`;

  const liquidBalanceStorageKey = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [senderAddress, 0n]),
  ) as `0x${string}`;
  const liquidBalanceStorageValue = ethers.zeroPadValue(ethers.toBeHex(noteValue), 32);
  await provider.send('anvil_setStorageAt', [
    manifest.contracts.l2AccountingVault,
    liquidBalanceStorageKey,
    liquidBalanceStorageValue,
  ]);
  await provider.send('evm_mine', []);

  const blockNumber = await provider.getBlockNumber();
  const noteCommitment = await controller.computeNoteCommitment(noteValue, noteOwner, noteSalt) as `0x${string}`;
  const noteRegistryStorageKey = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(['bytes32', 'uint256'], [noteCommitment, 0n]),
  ) as `0x${string}`;
  const selector = mintNotes1Interface.getFunction('mintNotes1')?.selector as `0x${string}` | undefined;
  if (!selector) {
    throw new Error('Failed to resolve mintNotes1 selector');
  }

  const config: PrivateStateMintConfig = {
    network: 'anvil',
    participants,
    storageConfigs: [
      {
        address: manifest.contracts.controller,
        userStorageSlots: [],
        preAllocatedKeys: ['0x00'],
      },
      {
        address: manifest.contracts.l2AccountingVault,
        userStorageSlots: [0],
        preAllocatedKeys: [],
      },
      {
        address: manifest.contracts.noteRegistry,
        userStorageSlots: [],
        preAllocatedKeys: [noteRegistryStorageKey],
      },
    ],
    entryContractAddress: manifest.contracts.controller,
    callCodeAddresses: [
      manifest.contracts.controller,
      manifest.contracts.l2AccountingVault,
      manifest.contracts.noteRegistry,
    ],
    blockNumber,
    txNonce: DEFAULT_L2_TX_NONCE,
    senderIndex,
    noteOwnerIndex,
    noteValue: ethers.toBeHex(noteValue) as `0x${string}`,
    noteSalt,
    function: {
      selector,
      entryContractAddress: manifest.contracts.controller,
    },
  };

  await writeConfig(outputPath, config);
  console.log(`Saved private-state mint config to ${outputPath}`);
};

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
