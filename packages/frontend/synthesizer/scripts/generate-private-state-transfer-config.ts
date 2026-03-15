#!/usr/bin/env node
/* eslint-disable no-console */

import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { ethers } from 'ethers';
import { fileURLToPath } from 'url';
import { fromEdwardsToAddress } from '../submodules/TokamakL2JS/src/index.ts';
import { BLS12831ARITHMODULUS } from '../src/synthesizer/params/index.ts';
import {
  buildPrivateStateTransferCalldata,
  deriveParticipantKeys,
  transferNotes4Interface,
  type PrivateStateNote,
  type PrivateStateTransferConfig,
} from '../examples/privateStateTransfer/utils.ts';

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
  contracts: {
    controller: `0x${string}`;
    l2AccountingVault: `0x${string}`;
    noteRegistry: `0x${string}`;
    nullifierRegistry: `0x${string}`;
  };
};

type UnregisteredStorageWarning = {
  address: `0x${string}`;
  key: `0x${string}`;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..', '..', '..', '..');
const scriptsEnvPath = path.resolve(__dirname, '.env');
const packageEnvPath = path.resolve(packageRoot, '.env');
const defaultOutputPath = path.resolve(packageRoot, 'scripts', 'private-state-transfer-config.json');
const deploymentManifestPath = path.resolve(repoRoot, 'apps', 'private-state', 'deploy', 'deployment.31337.latest.json');
const privateStateAppDir = path.resolve(repoRoot, 'apps', 'private-state');
const privateStateMainPath = path.resolve(packageRoot, 'examples', 'privateStateTransfer', 'main.ts');

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

const runAnalysisOnlyReplay = async (configPath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      'tsx',
      [privateStateMainPath, configPath],
      {
        cwd: packageRoot,
        env: {
          ...process.env,
          PRIVATE_STATE_ANALYSIS_ONLY: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let combinedOutput = '';
    child.stdout.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      combinedOutput += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      combinedOutput += text;
      process.stderr.write(text);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        console.warn(`Analysis-only replay exited with code ${code ?? 'unknown'}`);
      }
      resolve(combinedOutput);
    });
  });

const collectUnregisteredStorageWarnings = (output: string): UnregisteredStorageWarning[] => {
  const warnings: UnregisteredStorageWarning[] = [];
  const matches = output.matchAll(/AT MPT KEY (0X[0-9A-F]+) OF ADDRESS (0X[0-9A-F]+)/gu);
  for (const match of matches) {
    warnings.push({
      key: `0x${match[1].slice(2).toLowerCase()}` as `0x${string}`,
      address: `0x${match[2].slice(2).toLowerCase()}` as `0x${string}`,
    });
  }
  return warnings;
};

const applyWarningKeysToStorageConfigs = (
  storageConfigs: StorageConfigEntry[],
  warnings: UnregisteredStorageWarning[],
): StorageConfigEntry[] =>
  storageConfigs.map((entry) => {
    const incoming = warnings
      .filter((warning) => warning.address.toLowerCase() === entry.address.toLowerCase())
      .map((warning) => warning.key);
    if (incoming.length === 0) {
      return entry;
    }
    return {
      ...entry,
      preAllocatedKeys: mergeUniqueHexValues(entry.preAllocatedKeys, incoming),
    };
  });

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
  const noteValue = parseAmount(args.amount);
  const rpcUrl = typeof args.rpcUrl === 'string' && args.rpcUrl.trim().length > 0
    ? args.rpcUrl.trim()
    : process.env.ANVIL_RPC_URL?.trim() || DEFAULT_ANVIL_RPC_URL;
  const mnemonic = typeof args.mnemonic === 'string' && args.mnemonic.trim().length > 0
    ? args.mnemonic.trim()
    : process.env.APPS_ANVIL_MNEMONIC?.trim() || DEFAULT_ANVIL_MNEMONIC;

  if (participantCount < 3) {
    throw new Error('participants must be >= 3');
  }
  if (senderIndex < 0 || senderIndex >= participantCount) {
    throw new Error(`sender must be between 0 and ${participantCount - 1}`);
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
  const recipientOneIndex = (senderIndex + 1) % participantCount;
  const recipientTwoIndex = (senderIndex + 2) % participantCount;
  const recipientOneAddress = participants[recipientOneIndex]?.addressL1;
  const recipientTwoAddress = participants[recipientTwoIndex]?.addressL1;
  if (!senderAddress || !recipientOneAddress || !recipientTwoAddress) {
    throw new Error('Could not resolve transfer participants');
  }

  const selector = transferNotes4Interface.getFunction('transferNotes4')?.selector as `0x${string}` | undefined;
  if (!selector) {
    throw new Error('Failed to resolve transferNotes4 selector');
  }

  const inputValueHex = ethers.toBeHex(noteValue) as `0x${string}`;
  const doubleInputValueHex = ethers.toBeHex(noteValue * 2n) as `0x${string}`;
  const inputNotes = Array.from({length: 4}, (_, index) => ({
    owner: senderAddress,
    value: inputValueHex,
    salt: toSalt(`private-state-transfer-input-sender-${senderIndex}-${index}`),
  })) as PrivateStateTransferConfig['inputNotes'];
  const outputNotes = [
    {
      owner: senderAddress,
      value: doubleInputValueHex,
      salt: toSalt(`private-state-transfer-output-sender-${senderIndex}-0`),
    },
    {
      owner: recipientOneAddress,
      value: inputValueHex,
      salt: toSalt(`private-state-transfer-output-sender-${senderIndex}-1`),
    },
    {
      owner: recipientTwoAddress,
      value: inputValueHex,
      salt: toSalt(`private-state-transfer-output-sender-${senderIndex}-2`),
    },
  ] as PrivateStateTransferConfig['outputNotes'];

  const config: PrivateStateTransferConfig = {
    network: 'anvil',
    participants,
    storageConfigs: [],
    callCodeAddresses: [],
    blockNumber: 0,
    txNonce: DEFAULT_L2_TX_NONCE,
    calldata: '0x',
    senderIndex,
    inputNotes,
    outputNotes,
    function: {
      selector,
      entryContractAddress: manifest.contracts.controller,
    },
  };
  config.calldata = buildPrivateStateTransferCalldata(config, keyMaterial);

  const controllerInterface = new ethers.Interface([
    'function computeNoteCommitment(uint256 value, address owner, bytes32 salt) view returns (bytes32)',
    'function computeNullifier(uint256 value, address owner, bytes32 salt) view returns (bytes32)',
  ]);
  const controller = new ethers.Contract(manifest.contracts.controller, controllerInterface, provider);
  const truthyValue = ethers.zeroPadValue('0x01', 32);

  const inputCommitments: `0x${string}`[] = [];
  const outputCommitments: `0x${string}`[] = [];
  const nullifiers: `0x${string}`[] = [];

  for (const note of inputNotes) {
    const commitment = await controller.computeNoteCommitment(BigInt(note.value), note.owner, note.salt) as `0x${string}`;
    const nullifier = await controller.computeNullifier(BigInt(note.value), note.owner, note.salt) as `0x${string}`;
    inputCommitments.push(commitment);
    nullifiers.push(nullifier);

    const noteRegistryKey = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(['bytes32', 'uint256'], [commitment, 0n]),
    ) as `0x${string}`;
    await provider.send('anvil_setStorageAt', [manifest.contracts.noteRegistry, noteRegistryKey, truthyValue]);
  }

  for (const note of outputNotes) {
    const commitment = await controller.computeNoteCommitment(BigInt(note.value), note.owner, note.salt) as `0x${string}`;
    outputCommitments.push(commitment);
  }

  await provider.send('evm_mine', []);
  const blockNumber = await provider.getBlockNumber();

  const noteRegistryKeys = [...inputCommitments, ...outputCommitments].map((commitment) =>
    ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(['bytes32', 'uint256'], [commitment, 0n]),
    ) as `0x${string}`);
  const nullifierKeys = nullifiers.map((nullifier) =>
    ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(['bytes32', 'uint256'], [nullifier, 0n]),
    ) as `0x${string}`);

  config.blockNumber = blockNumber;
  config.storageConfigs = [
    {
      address: manifest.contracts.controller,
      userStorageSlots: [],
      preAllocatedKeys: ['0x00'],
    },
    {
      address: manifest.contracts.noteRegistry,
      userStorageSlots: [],
      preAllocatedKeys: noteRegistryKeys,
    },
    {
      address: manifest.contracts.nullifierRegistry,
      userStorageSlots: [],
      preAllocatedKeys: nullifierKeys,
    },
  ];
  config.callCodeAddresses = [
    manifest.contracts.controller,
    manifest.contracts.noteRegistry,
    manifest.contracts.nullifierRegistry,
  ];

  await writeConfig(outputPath, config);
  const replayOutput = await runAnalysisOnlyReplay(outputPath);
  const warningKeys = collectUnregisteredStorageWarnings(replayOutput);
  if (warningKeys.length > 0) {
    const updatedConfig: PrivateStateTransferConfig = {
      ...config,
      storageConfigs: applyWarningKeysToStorageConfigs(config.storageConfigs, warningKeys),
    };
    await writeConfig(outputPath, updatedConfig);
  }
  console.log(`Saved private-state transfer config to ${outputPath}`);
};

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
