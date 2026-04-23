#!/usr/bin/env node
/* eslint-disable no-console */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import { addHexPrefix, bytesToHex, createAddressFromString, hexToBytes } from '@ethereumjs/util';
import {
  createStateManagerOptsFromChannelConfig,
  createTokamakL2Common,
  createTokamakL2StateManagerFromL1RPC,
  createTokamakL2Tx,
  fromEdwardsToAddress,
  type ChannelStateConfig,
  type StateSnapshot,
  type TokamakL2TxData,
  type TxSnapshot,
} from 'tokamak-l2js';
import { installedSubcircuitLibrary } from '../node-cli/src/subcircuit/installedLibrary.ts';
import {
  DEFAULT_EXAMPLE_NOTE_RECEIVE_CHANNEL_NAME,
  buildPrivateStateMintCalldata,
  buildPrivateStateRedeemCalldata,
  buildPrivateStateTransferCalldata,
  createTransferInterface,
  deriveNoteReceiveKeyMaterial,
  derivePrivateStateParticipantKeys,
  mintInterfaces,
  redeemInterfaces,
  type DerivedParticipantKeys,
  type MintExampleParticipant,
  type PrivateStateRedeemConfig,
  type PrivateStateTransferConfig,
  type PrivateStateTransferOutput,
} from '../node-cli/examples/privateState/utils.ts';
import {
  computeReplayPrivateStateAddressMappingKey,
  computeReplayPrivateStateEncryptedNoteSalt,
  computeReplayPrivateStateMappingKey,
  computeReplayPrivateStateNoteCommitment,
  deriveReplayPrivateStateFieldValue,
  getPrivateStateManagedStorageAddresses,
  getPrivateStateControllerCommitmentExistsSlot,
  getPrivateStateVaultLiquidBalancesSlot,
  type PrivateStateNoteLike,
  type PrivateStateStorageLayoutManifest,
} from '../node-cli/scripts/utils/private-state.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const nodeCliRoot = path.resolve(packageRoot, 'node-cli');
const examplesRoot = path.resolve(nodeCliRoot, 'examples', 'privateState');
const privateStateArtifactsDriveRootFolderId = '1dj9_Cyc5x1nEB85LtqeF7vRLhpkKTNHj';
const driveFolderMimeType = 'application/vnd.google-apps.folder';
const defaultChannelId = 4;
const defaultParticipantCount = 4;
const defaultMintNoteValue = 1n * 10n ** 18n;
const defaultRedeemNoteValue = 1n * 10n ** 18n;
const defaultAmountUnit = 10n ** 18n;
const defaultMnemonic = 'test test test test test test test test test test test junk';
const defaultTxNonce = 0;

type AppNetwork =
  | 'sepolia'
  | 'mainnet'
  | 'base-sepolia'
  | 'base-mainnet'
  | 'arb-sepolia'
  | 'arb-mainnet'
  | 'op-mainnet'
  | 'op-sepolia'
  | 'anvil';

type ChannelStateNetwork = 'mainnet' | 'sepolia' | 'anvil';

type DeploymentManifest = {
  chainId: number;
  contracts: {
    controller: `0x${string}`;
    l2AccountingVault: `0x${string}`;
  };
};

type LaunchManifestEntry = {
  name: string;
  files: {
    previousState: string;
    transaction: string;
    blockInfo: string;
    contractCode: string;
  };
};

type StorageWrite = {
  address: `0x${string}`;
  key: `0x${string}`;
  value: `0x${string}`;
};

type SynthesizerBlockInfo = {
  coinBase: `0x${string}`;
  timeStamp: `0x${string}`;
  blockNumber: `0x${string}`;
  prevRanDao: `0x${string}`;
  gasLimit: `0x${string}`;
  chainId: `0x${string}`;
  selfBalance: `0x${string}`;
  prevBlockHashes: `0x${string}`[];
  baseFee: `0x${string}`;
};

type ExampleContext = {
  appNetwork: AppNetwork;
  channelStateNetwork: ChannelStateNetwork;
  chainId: number;
  rpcUrl: string;
  blockNumber: number;
  manifest: DeploymentManifest;
  storageLayoutManifest: PrivateStateStorageLayoutManifest;
  participants: MintExampleParticipant[];
  keyMaterial: DerivedParticipantKeys;
};

type DriveEntry = {
  id: string;
  name: string;
  mimeType: string;
};

const networkConfig = new Map<AppNetwork, { chainId: number; alchemyNetwork: string | null }>([
  ['sepolia', { chainId: 11155111, alchemyNetwork: 'eth-sepolia' }],
  ['mainnet', { chainId: 1, alchemyNetwork: 'eth-mainnet' }],
  ['base-sepolia', { chainId: 84532, alchemyNetwork: 'base-sepolia' }],
  ['base-mainnet', { chainId: 8453, alchemyNetwork: 'base-mainnet' }],
  ['arb-sepolia', { chainId: 421614, alchemyNetwork: 'arb-sepolia' }],
  ['arb-mainnet', { chainId: 42161, alchemyNetwork: 'arb-mainnet' }],
  ['op-mainnet', { chainId: 10, alchemyNetwork: 'opt-mainnet' }],
  ['op-sepolia', { chainId: 11155420, alchemyNetwork: 'opt-sepolia' }],
  ['anvil', { chainId: 31337, alchemyNetwork: null }],
]);

const parseAppNetwork = (): AppNetwork => {
  const raw = process.env.APPS_NETWORK?.trim();
  if (!raw) {
    throw new Error('APPS_NETWORK must be set before generating synthesizer launch inputs.');
  }
  if (!networkConfig.has(raw as AppNetwork)) {
    throw new Error(`Unsupported APPS_NETWORK=${raw}`);
  }
  return raw as AppNetwork;
};

const toChannelStateNetwork = (network: AppNetwork): ChannelStateNetwork => {
  if (network === 'mainnet') {
    return 'mainnet';
  }
  if (network === 'sepolia') {
    return 'sepolia';
  }
  return 'anvil';
};

const resolveRpcUrl = (network: AppNetwork): string => {
  const override = process.env.APPS_RPC_URL_OVERRIDE?.trim();
  if (override) {
    return override;
  }
  if (network === 'anvil') {
    return 'http://127.0.0.1:8545';
  }
  const apiKey = process.env.APPS_ALCHEMY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(`APPS_ALCHEMY_API_KEY must be set for APPS_NETWORK=${network}`);
  }
  const config = networkConfig.get(network);
  if (!config?.alchemyNetwork) {
    throw new Error(`Unsupported APPS_NETWORK=${network} without APPS_RPC_URL_OVERRIDE`);
  }
  return `https://${config.alchemyNetwork}.g.alchemy.com/v2/${apiKey}`;
};

const deploymentManifestFilename = (chainId: number) => `deployment.${chainId}.latest.json`;

const storageLayoutManifestFilename = (chainId: number) => `storage-layout.${chainId}.latest.json`;

const writeJson = async (filePath: string, value: unknown) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const toRelativeNodeCliPath = (filePath: string) =>
  path.relative(nodeCliRoot, filePath).split(path.sep).join('/');

const fetchText = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
};

const decodeDriveInlineData = (encoded: string) =>
  encoded
    .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');

const collectDriveEntries = (node: unknown, entries = new Map<string, DriveEntry>()) => {
  if (!Array.isArray(node)) {
    return entries;
  }

  if (
    typeof node[0] === 'string' &&
    Array.isArray(node[1]) &&
    typeof node[2] === 'string' &&
    typeof node[3] === 'string'
  ) {
    entries.set(node[0], {
      id: node[0],
      name: node[2],
      mimeType: node[3],
    });
  }

  for (const child of node) {
    collectDriveEntries(child, entries);
  }

  return entries;
};

const loadDriveFolderEntries = async (folderId: string): Promise<DriveEntry[]> => {
  const html = await fetchText(`https://drive.google.com/drive/folders/${folderId}`);
  const inlineDataMatch = html.match(/window\['_DRIVE_ivd'\]\s*=\s*'([^']*)';/s);
  if (!inlineDataMatch?.[1]) {
    throw new Error(`Could not parse Google Drive folder listing for ${folderId}`);
  }

  const decoded = decodeDriveInlineData(inlineDataMatch[1]);
  const parsed = JSON.parse(decoded) as unknown;
  return [...collectDriveEntries(parsed).values()];
};

const findDriveEntryByName = (entries: DriveEntry[], name: string, mimeType?: string) =>
  entries.find((entry) => entry.name === name && (mimeType === undefined || entry.mimeType === mimeType));

const resolveDriveManifestFileIds = async (chainId: number) => {
  const rootEntries = await loadDriveFolderEntries(privateStateArtifactsDriveRootFolderId);
  const privateStateFolder = findDriveEntryByName(rootEntries, 'private-state', driveFolderMimeType);
  if (!privateStateFolder) {
    throw new Error('Could not find the private-state folder in the configured Google Drive root folder.');
  }

  const deploymentFilename = deploymentManifestFilename(chainId);
  const storageLayoutFilename = storageLayoutManifestFilename(chainId);
  const foldersToVisit = [privateStateFolder];
  const visitedFolderIds = new Set<string>();

  while (foldersToVisit.length > 0) {
    const candidateFolder = foldersToVisit.shift();
    if (!candidateFolder || visitedFolderIds.has(candidateFolder.id)) {
      continue;
    }
    visitedFolderIds.add(candidateFolder.id);

    const entries = await loadDriveFolderEntries(candidateFolder.id);
    const deployment = findDriveEntryByName(entries, deploymentFilename, 'application/json');
    const storageLayout = findDriveEntryByName(entries, storageLayoutFilename, 'application/json');
    if (deployment && storageLayout) {
      return {
        deploymentFileId: deployment.id,
        storageLayoutFileId: storageLayout.id,
      };
    }

    const childFolders = entries
      .filter((entry) => entry.mimeType === driveFolderMimeType)
      .sort((left, right) => right.name.localeCompare(left.name));
    foldersToVisit.push(...childFolders);
  }

  throw new Error(
    `Could not find ${deploymentFilename} and ${storageLayoutFilename} in the configured Google Drive folder tree.`,
  );
};

const readDriveJson = async <T>(fileId: string): Promise<T> =>
  JSON.parse(await fetchText(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`)) as T;

const makeLaunchEntryName = (
  functionName: string,
  appNetwork: AppNetwork,
) => `Private-state ${functionName} on ${appNetwork}`;

const assignChannelId = (
  stateManager: Awaited<ReturnType<typeof createTokamakL2StateManagerFromL1RPC>>,
  channelId: number,
) => {
  ((stateManager as unknown) as { _channelId?: number })._channelId = channelId;
};

const buildParticipants = async (
  participantCount: number,
  mnemonic: string,
  chainId: number,
): Promise<MintExampleParticipant[]> => {
  const participants: MintExampleParticipant[] = [];
  for (let index = 0; index < participantCount; index += 1) {
    const wallet = ethers.HDNodeWallet.fromPhrase(
      mnemonic,
      undefined,
      `m/44'/60'/0'/0/${index}`,
    );
    const noteReceive = await deriveNoteReceiveKeyMaterial({
      signer: wallet,
      chainId,
      channelId: defaultChannelId,
      channelName: DEFAULT_EXAMPLE_NOTE_RECEIVE_CHANNEL_NAME,
      account: wallet.address as `0x${string}`,
    });
    participants.push({
      addressL1: wallet.address as `0x${string}`,
      prvSeedL2: `private-state participant ${index}`,
      noteReceivePubKeyX: noteReceive.noteReceivePubKey.x,
      noteReceivePubKeyYParity: noteReceive.noteReceivePubKey.yParity,
    });
  }
  return participants;
};

const deriveChannelParticipants = async (participantCount: number, mnemonic: string, chainId: number) => {
  const baseParticipants = await buildParticipants(participantCount, mnemonic, chainId);
  const keyMaterial = derivePrivateStateParticipantKeys(baseParticipants);
  const participants = baseParticipants.map((participant, index) => ({
    ...participant,
    addressL1: fromEdwardsToAddress(keyMaterial.publicKeys[index]).toString() as `0x${string}`,
  }));
  return { participants, keyMaterial };
};

const defaultTransferValue = (inputCount: number, outputCount: number): bigint => {
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
  return lcm(ethers.toBigInt(inputCount), ethers.toBigInt(outputCount)) * defaultAmountUnit;
};

const buildBaseStateConfig = (
  context: ExampleContext,
  storageAddresses: `0x${string}`[],
  callCodeAddresses: `0x${string}`[],
): ChannelStateConfig => ({
  network: context.channelStateNetwork,
  participants: context.participants,
  storageConfigs: storageAddresses.map((address) => ({
    address,
    userStorageSlots: [],
    preAllocatedKeys: [],
  })),
  callCodeAddresses,
  blockNumber: context.blockNumber,
});

const createSyntheticSnapshot = async (
  context: ExampleContext,
  storageAddresses: `0x${string}`[],
  callCodeAddresses: `0x${string}`[],
  writes: StorageWrite[],
): Promise<StateSnapshot> => {
  const stateManagerOpts = createStateManagerOptsFromChannelConfig(
    buildBaseStateConfig(context, storageAddresses, callCodeAddresses),
  );
  const stateManager = await createTokamakL2StateManagerFromL1RPC(context.rpcUrl, stateManagerOpts);
  assignChannelId(stateManager, defaultChannelId);

  for (const write of writes) {
    await stateManager.putStorage(
      createAddressFromString(write.address),
      hexToBytes(addHexPrefix(write.key)),
      hexToBytes(addHexPrefix(write.value)),
    );
  }

  return stateManager.captureStateSnapshot();
};

const buildTransactionSnapshot = (
  context: ExampleContext,
  senderIndex: number,
  entryContractAddress: `0x${string}`,
  calldata: `0x${string}`,
): TxSnapshot => {
  const senderPrivateKey = context.keyMaterial.privateKeys[senderIndex];
  const senderPublicKey = context.keyMaterial.publicKeys[senderIndex];
  if (!senderPrivateKey || !senderPublicKey) {
    throw new Error(`Could not resolve sender key material for participant ${senderIndex}`);
  }

  const txData: TokamakL2TxData = {
    nonce: ethers.toBigInt(defaultTxNonce),
    to: createAddressFromString(entryContractAddress),
    data: hexToBytes(addHexPrefix(calldata)),
    senderPubKey: senderPublicKey.toBytes(),
  };
  return createTokamakL2Tx(txData, { common: createTokamakL2Common() })
    .sign(senderPrivateKey)
    .captureTxSnapshot();
};

const fetchContractCodes = async (
  rpcUrl: string,
  blockNumber: number,
  addresses: `0x${string}`[],
) => {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return Promise.all(
    addresses.map(async (address) => ({
      address,
      code: await provider.getCode(address, blockNumber),
    })),
  );
};

const getBlockInfoFromRPC = async (
  rpcUrl: string,
  blockNumber: number,
  nHashes: number,
): Promise<SynthesizerBlockInfo> => {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const block = await provider.getBlock(blockNumber, false);

  if (block === null) {
    throw new Error(`RPC returned no block for block number ${blockNumber}`);
  }

  const prevBlockHashes: `0x${string}`[] = [];
  for (let index = 0; index < nHashes; index += 1) {
    const previousBlockNumber = blockNumber - index - 1;
    if (previousBlockNumber < 0) {
      prevBlockHashes.push('0x0');
      continue;
    }
    const previousBlock = await provider.getBlock(previousBlockNumber, false);
    prevBlockHashes.push((previousBlock?.hash ?? '0x0') as `0x${string}`);
  }

  return {
    coinBase: (block.miner ?? ethers.ZeroAddress) as `0x${string}`,
    timeStamp: `0x${block.timestamp.toString(16)}` as `0x${string}`,
    blockNumber: `0x${block.number.toString(16)}` as `0x${string}`,
    prevRanDao: (
      block.prevRandao == null
        ? `0x${block.difficulty.toString(16)}`
        : block.prevRandao
    ) as `0x${string}`,
    gasLimit: `0x${block.gasLimit.toString(16)}` as `0x${string}`,
    chainId: `0x${(await provider.getNetwork()).chainId.toString(16)}` as `0x${string}`,
    selfBalance: '0x0',
    prevBlockHashes,
    baseFee: `0x${(block.baseFeePerGas || 0n).toString(16)}` as `0x${string}`,
  };
};

const writeLaunchInput = async (
  outputDir: string,
  previousState: StateSnapshot,
  transaction: TxSnapshot,
  blockInfo: SynthesizerBlockInfo,
  contractCodes: Array<{ address: `0x${string}`; code: string }>,
  name: string,
): Promise<LaunchManifestEntry> => {
  const previousStatePath = path.join(outputDir, 'previous_state_snapshot.json');
  const transactionPath = path.join(outputDir, 'transaction.json');
  const blockInfoPath = path.join(outputDir, 'block_info.json');
  const contractCodePath = path.join(outputDir, 'contract_codes.json');

  await writeJson(previousStatePath, previousState);
  await writeJson(transactionPath, transaction);
  await writeJson(blockInfoPath, blockInfo);
  await writeJson(contractCodePath, contractCodes);

  return {
    name,
    files: {
      previousState: toRelativeNodeCliPath(previousStatePath),
      transaction: toRelativeNodeCliPath(transactionPath),
      blockInfo: toRelativeNodeCliPath(blockInfoPath),
      contractCode: toRelativeNodeCliPath(contractCodePath),
    },
  };
};

const buildMintManifest = async (
  context: ExampleContext,
  blockInfo: SynthesizerBlockInfo,
  contractCodes: Array<{ address: `0x${string}`; code: string }>,
) => {
  const managedStorageAddresses = getPrivateStateManagedStorageAddresses(context.storageLayoutManifest);
  const liquidBalancesSlot = getPrivateStateVaultLiquidBalancesSlot(context.storageLayoutManifest);
  const senderIndex = 0;
  const noteOwnerIndex = senderIndex;
  const senderAddress = context.participants[senderIndex]?.addressL1;
  if (!senderAddress) {
    throw new Error(`Could not resolve sender address for participant ${senderIndex}`);
  }

  const entries: LaunchManifestEntry[] = [];
  for (const outputCount of [1, 2, 3, 4, 5, 6] as const) {
    const noteValues = Array.from({ length: outputCount }, () =>
      ethers.toBeHex(defaultMintNoteValue) as `0x${string}`,
    ) as [`0x${string}`, ...`0x${string}`[]];
    const noteSalts = Array.from({ length: outputCount }, (_, index) =>
      deriveReplayPrivateStateFieldValue(
        `private-state-mint-sender-${senderIndex}-owner-${noteOwnerIndex}-output-${index}`,
      ),
    ) as [`0x${string}`, ...`0x${string}`[]];

    const calldata = buildPrivateStateMintCalldata(
      {
        network: 'anvil',
        participants: context.participants,
        storageConfigs: [],
        callCodeAddresses: [],
        blockNumber: context.blockNumber,
        txNonce: defaultTxNonce,
        calldata: '0x',
        senderIndex,
        noteOwnerIndex,
        outputCount,
        noteValues,
        noteSalts,
        function: {
          selector: mintInterfaces[outputCount].getFunction(`mintNotes${outputCount}`)?.selector as `0x${string}`,
          entryContractAddress: context.manifest.contracts.controller,
        },
      },
      context.keyMaterial,
    );

    const totalValue = defaultMintNoteValue * ethers.toBigInt(outputCount);
    const balanceKey = computeReplayPrivateStateAddressMappingKey(senderAddress, liquidBalancesSlot);
    const snapshot = await createSyntheticSnapshot(
      context,
      managedStorageAddresses,
      managedStorageAddresses,
      [{
        address: context.manifest.contracts.l2AccountingVault,
        key: balanceKey,
        value: ethers.zeroPadValue(ethers.toBeHex(totalValue), 32) as `0x${string}`,
      }],
    );

    const transaction = buildTransactionSnapshot(
      context,
      senderIndex,
      context.manifest.contracts.controller,
      calldata,
    );
    entries.push(
      await writeLaunchInput(
        path.resolve(examplesRoot, 'mintNotes', `mintNotes${outputCount}`),
        snapshot,
        transaction,
        blockInfo,
        contractCodes,
        makeLaunchEntryName(`mintNotes${outputCount}`, context.appNetwork),
      ),
    );
  }
  return entries;
};

const buildTransferManifest = async (
  context: ExampleContext,
  blockInfo: SynthesizerBlockInfo,
  contractCodes: Array<{ address: `0x${string}`; code: string }>,
) => {
  const managedStorageAddresses = getPrivateStateManagedStorageAddresses(context.storageLayoutManifest);
  const commitmentExistsSlot = getPrivateStateControllerCommitmentExistsSlot(context.storageLayoutManifest);
  const senderIndex = 0;
  const senderAddress = context.participants[senderIndex]?.addressL1;
  const recipientOneAddress = context.participants[1]?.addressL1;
  const recipientTwoAddress = context.participants[2]?.addressL1;
  if (!senderAddress || !recipientOneAddress || !recipientTwoAddress) {
    throw new Error('Could not resolve transfer participants');
  }

  const entries: LaunchManifestEntry[] = [];
  for (const [inputCount, outputCount] of [
    [1, 1],
    [1, 2],
    [1, 3],
    [2, 1],
    [2, 2],
    [3, 1],
    [3, 2],
    [4, 1],
  ] as const) {
    const noteValue = defaultTransferValue(inputCount, outputCount);
    const inputValue = noteValue / ethers.toBigInt(inputCount);
    const outputValue = noteValue / ethers.toBigInt(outputCount);
    const inputValueHex = ethers.toBeHex(inputValue) as `0x${string}`;
    const outputValueHex = ethers.toBeHex(outputValue) as `0x${string}`;

    const inputNotes = Array.from({ length: inputCount }, (_, index) => ({
      owner: senderAddress,
      value: inputValueHex,
      salt: deriveReplayPrivateStateFieldValue(
        `private-state-transfer-input-sender-${senderIndex}-${inputCount}-${outputCount}--${index}`,
      ),
    })) as PrivateStateTransferConfig['inputNotes'];

    const outputOwners = outputCount === 1
      ? [recipientOneAddress]
      : outputCount === 2
        ? [recipientOneAddress, senderAddress]
        : [recipientOneAddress, senderAddress, recipientTwoAddress];
    const transferOutputs = outputOwners.map((owner, index) => ({
      owner,
      value: outputValueHex,
      encryptedNoteValue: [
        deriveReplayPrivateStateFieldValue(
          `private-state-transfer-output-sender-${senderIndex}-${inputCount}-${outputCount}--${index}:word0`,
        ),
        deriveReplayPrivateStateFieldValue(
          `private-state-transfer-output-sender-${senderIndex}-${inputCount}-${outputCount}--${index}:word1`,
        ),
        deriveReplayPrivateStateFieldValue(
          `private-state-transfer-output-sender-${senderIndex}-${inputCount}-${outputCount}--${index}:word2`,
        ),
      ],
    })) as PrivateStateTransferOutput[];

    const outputNotes = transferOutputs.map((output) => ({
      owner: output.owner,
      value: output.value,
      salt: computeReplayPrivateStateEncryptedNoteSalt(output.encryptedNoteValue),
    })) as PrivateStateTransferConfig['outputNotes'];

    const functionName = `transferNotes${inputCount}To${outputCount}`;
    const calldata = buildPrivateStateTransferCalldata(
      {
        network: 'anvil',
        participants: context.participants,
        storageConfigs: [],
        callCodeAddresses: [],
        blockNumber: context.blockNumber,
        txNonce: defaultTxNonce,
        calldata: '0x',
        senderIndex,
        functionName,
        inputCount,
        outputCount,
        inputNotes,
        transferOutputs,
        outputNotes,
        function: {
          selector: createTransferInterface(inputCount, outputCount).getFunction(functionName)?.selector as `0x${string}`,
          entryContractAddress: context.manifest.contracts.controller,
        },
      },
      context.keyMaterial,
    );

    const noteRegistryWrites = inputNotes.map((note) => {
      const commitment = computeReplayPrivateStateNoteCommitment(note as PrivateStateNoteLike);
      return {
        address: context.manifest.contracts.controller,
        key: computeReplayPrivateStateMappingKey(commitment, commitmentExistsSlot),
        value: ethers.zeroPadValue('0x01', 32) as `0x${string}`,
      } satisfies StorageWrite;
    });

    const snapshot = await createSyntheticSnapshot(
      context,
      managedStorageAddresses,
      managedStorageAddresses,
      noteRegistryWrites,
    );
    const transaction = buildTransactionSnapshot(
      context,
      senderIndex,
      context.manifest.contracts.controller,
      calldata,
    );
    entries.push(
      await writeLaunchInput(
        path.resolve(examplesRoot, 'transferNotes', `transferNotes${inputCount}To${outputCount}`),
        snapshot,
        transaction,
        blockInfo,
        contractCodes,
        makeLaunchEntryName(`transferNotes${inputCount}To${outputCount}`, context.appNetwork),
      ),
    );
  }

  return entries;
};

const buildRedeemManifest = async (
  context: ExampleContext,
  blockInfo: SynthesizerBlockInfo,
  contractCodes: Array<{ address: `0x${string}`; code: string }>,
) => {
  const managedStorageAddresses = getPrivateStateManagedStorageAddresses(context.storageLayoutManifest);
  const commitmentExistsSlot = getPrivateStateControllerCommitmentExistsSlot(context.storageLayoutManifest);
  const senderIndex = 0;
  const receiverIndex = 1;
  const senderAddress = context.participants[senderIndex]?.addressL1;
  if (!senderAddress) {
    throw new Error(`Could not resolve redeem sender address for participant ${senderIndex}`);
  }

  const entries: LaunchManifestEntry[] = [];
  for (const inputCount of [1, 2, 3, 4] as const) {
    const inputNotes = Array.from({ length: inputCount }, (_, index) => ({
      owner: senderAddress,
      value: ethers.toBeHex(defaultRedeemNoteValue) as `0x${string}`,
      salt: deriveReplayPrivateStateFieldValue(`private-state-redeem-input-sender-${senderIndex}-${index}`),
    })) as PrivateStateRedeemConfig['inputNotes'];

    const functionName = `redeemNotes${inputCount}` as
      | 'redeemNotes1'
      | 'redeemNotes2'
      | 'redeemNotes3'
      | 'redeemNotes4';
    const calldata = buildPrivateStateRedeemCalldata(
      {
        network: 'anvil',
        participants: context.participants,
        storageConfigs: [],
        callCodeAddresses: [],
        blockNumber: context.blockNumber,
        txNonce: defaultTxNonce,
        calldata: '0x',
        senderIndex,
        receiverIndex,
        inputCount,
        inputNotes,
        function: {
          selector: redeemInterfaces[inputCount].getFunction(functionName)?.selector as `0x${string}`,
          entryContractAddress: context.manifest.contracts.controller,
        },
      },
      context.keyMaterial,
    );

    const noteRegistryWrites = inputNotes.map((note) => {
      const commitment = computeReplayPrivateStateNoteCommitment(note as PrivateStateNoteLike);
      return {
        address: context.manifest.contracts.controller,
        key: computeReplayPrivateStateMappingKey(commitment, commitmentExistsSlot),
        value: ethers.zeroPadValue('0x01', 32) as `0x${string}`,
      } satisfies StorageWrite;
    });

    const snapshot = await createSyntheticSnapshot(
      context,
      managedStorageAddresses,
      managedStorageAddresses,
      noteRegistryWrites,
    );
    const transaction = buildTransactionSnapshot(
      context,
      senderIndex,
      context.manifest.contracts.controller,
      calldata,
    );
    entries.push(
      await writeLaunchInput(
        path.resolve(examplesRoot, 'redeemNotes', `redeemNotes${inputCount}`),
        snapshot,
        transaction,
        blockInfo,
        contractCodes,
        makeLaunchEntryName(`redeemNotes${inputCount}`, context.appNetwork),
      ),
    );
  }

  return entries;
};

const main = async () => {
  const appNetwork = parseAppNetwork();
  const config = networkConfig.get(appNetwork);
  if (!config) {
    throw new Error(`Unsupported APPS_NETWORK=${appNetwork}`);
  }

  const chainId = config.chainId;
  const rpcUrl = resolveRpcUrl(appNetwork);
  const { deploymentFileId, storageLayoutFileId } = await resolveDriveManifestFileIds(chainId);
  const manifest = await readDriveJson<DeploymentManifest>(deploymentFileId);
  const storageLayoutManifest = await readDriveJson<PrivateStateStorageLayoutManifest>(storageLayoutFileId);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const blockNumber = await provider.getBlockNumber();
  const blockInfo = await getBlockInfoFromRPC(
    rpcUrl,
    blockNumber,
    installedSubcircuitLibrary.numberOfPrevBlockHashes,
  );
  const mnemonic = process.env.APPS_ANVIL_MNEMONIC?.trim() || defaultMnemonic;
  const { participants, keyMaterial } = await deriveChannelParticipants(defaultParticipantCount, mnemonic, chainId);

  const context: ExampleContext = {
    appNetwork,
    channelStateNetwork: toChannelStateNetwork(appNetwork),
    chainId,
    rpcUrl,
    blockNumber,
    manifest,
    storageLayoutManifest,
    participants,
    keyMaterial,
  };

  const managedStorageAddresses = getPrivateStateManagedStorageAddresses(storageLayoutManifest);
  const contractCodes = await fetchContractCodes(
    rpcUrl,
    blockNumber,
    managedStorageAddresses,
  );

  const mintManifest = await buildMintManifest(context, blockInfo, contractCodes);
  const transferManifest = await buildTransferManifest(context, blockInfo, contractCodes);
  const redeemManifest = await buildRedeemManifest(context, blockInfo, contractCodes);

  await writeJson(path.resolve(examplesRoot, 'mintNotes', 'cli-launch-manifest.json'), mintManifest);
  await writeJson(path.resolve(examplesRoot, 'transferNotes', 'cli-launch-manifest.json'), transferManifest);
  await writeJson(path.resolve(examplesRoot, 'redeemNotes', 'cli-launch-manifest.json'), redeemManifest);

  console.log(
    JSON.stringify(
      {
        appNetwork,
        chainId,
        blockNumber,
        mintExamples: mintManifest.length,
        transferExamples: transferManifest.length,
        redeemExamples: redeemManifest.length,
      },
      null,
      2,
    ),
  );
};

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
