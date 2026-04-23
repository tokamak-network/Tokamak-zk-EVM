#!/usr/bin/env node
/* eslint-disable no-console */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import { RLP } from '@ethereumjs/rlp';
import {
  MapDB,
  addHexPrefix,
  bytesToBigInt,
  bytesToHex,
  createAddressFromString,
  hexToBytes,
  unpadBytes,
} from '@ethereumjs/util';
import { MerklePatriciaTrie } from '@ethereumjs/mpt';
import {
  createTokamakL2Common,
  createTokamakL2Tx,
  fromEdwardsToAddress,
  type StateSnapshot,
  type TokamakL2TxData,
  type TxSnapshot,
} from 'tokamak-l2js';
import { TokamakL2MerkleTrees } from '../../../node_modules/tokamak-l2js/dist/stateManager/TokamakMerkleTrees.js';
import {
  DEFAULT_EXAMPLE_NOTE_RECEIVE_CHANNEL_NAME,
  buildPrivateStateMintCalldata,
  buildPrivateStateRedeemCalldata,
  buildPrivateStateTransferCalldata,
  deriveNoteReceiveKeyMaterial,
  derivePrivateStateParticipantKeys,
  type DerivedParticipantKeys,
  type MintExampleParticipant,
  type PrivateStateRedeemConfig,
  type PrivateStateTransferConfig,
  type PrivateStateTransferOutput,
} from './utils.ts';
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
} from '../../scripts/utils/private-state.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '../../..');
const nodeCliRoot = path.resolve(packageRoot, 'node-cli');
const examplesRoot = __dirname;
const privateStateArtifactsDriveRootFolderId = '1dj9_Cyc5x1nEB85LtqeF7vRLhpkKTNHj';
const driveFolderMimeType = 'application/vnd.google-apps.folder';
const privateStateControllerCallableAbiFilename = 'PrivateStateController.callable-abi.json';
const defaultChannelId = 4;
const defaultParticipantCount = 4;
const defaultMintNoteValue = 1n * 10n ** 18n;
const defaultRedeemNoteValue = 1n * 10n ** 18n;
const defaultAmountUnit = 10n ** 18n;
const defaultMnemonic = 'test test test test test test test test test test test junk';
const defaultTxNonce = 0;

type Address = `0x${string}`;
type Hex = `0x${string}`;
type ExampleNetwork = 'mainnet' | 'sepolia' | 'anvil';

type DeploymentManifest = {
  chainId: number;
  contracts: {
    controller: Address;
    l2AccountingVault: Address;
  };
  deployedBytecode: {
    controller: Hex;
    l2AccountingVault: Hex;
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
  address: Address;
  key: Hex;
  value: Hex;
};

type SynthesizerBlockInfo = {
  coinBase: Address;
  timeStamp: Hex;
  blockNumber: Hex;
  prevRanDao: Hex;
  gasLimit: Hex;
  chainId: Hex;
  selfBalance: Hex;
  prevBlockHashes: Hex[];
  baseFee: Hex;
};

type ExampleContext = {
  chainId: number;
  exampleNetwork: ExampleNetwork;
  manifest: DeploymentManifest;
  storageLayoutManifest: PrivateStateStorageLayoutManifest;
  controllerInterface: ethers.Interface;
  participants: MintExampleParticipant[];
  keyMaterial: DerivedParticipantKeys;
};

type DriveEntry = {
  id: string;
  name: string;
  mimeType: string;
};

type DriveArtifactIds = {
  deploymentFileId: string;
  storageLayoutFileId: string;
  controllerCallableAbiFileId: string;
};

type ContractCodeEntry = {
  address: Address;
  code: Hex;
};

const staticBlockInfo: SynthesizerBlockInfo = {
  coinBase: '0x0000000000000000000000000000000000000000',
  timeStamp: '0x69e150e7',
  blockNumber: '0x8',
  prevRanDao: '0xf96958848bdee2c01fe2c0cb9c59c6eb51567b4292b8344581436a8837be9f14',
  gasLimit: '0x1c9c380',
  chainId: '0x7a69',
  selfBalance: '0x0',
  prevBlockHashes: [
    '0x2a3b24fbcdae81b5e1d736e72ef4c74d0d643aa6bd4efa471338818602b84543',
    '0xffae6744d483d9a7c9da5e62b597375199a08984df6f31388137078210eee731',
    '0xb57ad9f563489a9a7837715fc9e38c150fa40fa765f9e9b75a4456c26013af6a',
    '0x3d6d64e9c0c5d044d9d362cda0a194c9c656fcace24abd5972d2e8dff362c3f8',
  ],
  baseFee: '0x1ba94a75',
};

const timestampFolderNamePattern = /^\d{8}T\d{6}Z$/;
const deploymentManifestPattern = /^deployment\.\d+\.latest\.json$/;
const storageLayoutManifestPattern = /^storage-layout\.\d+\.latest\.json$/;

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
    .replace(/\\=/g, '=')
    .replace(/\\\//g, '/')
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

const selectSingleMatchingEntry = (
  entries: DriveEntry[],
  pattern: RegExp,
  label: string,
  mimeType?: string,
) => {
  const matches = entries.filter((entry) =>
    pattern.test(entry.name) && (mimeType === undefined || entry.mimeType === mimeType));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${label} in the latest private-state Drive folder, found ${matches.length}.`);
  }
  return matches[0];
};

const resolveDriveArtifactIds = async (): Promise<DriveArtifactIds> => {
  const rootEntries = await loadDriveFolderEntries(privateStateArtifactsDriveRootFolderId);
  const privateStateFolder = findDriveEntryByName(rootEntries, 'private-state', driveFolderMimeType);
  if (!privateStateFolder) {
    throw new Error('Could not find the private-state folder in the configured Google Drive root folder.');
  }

  const privateStateEntries = await loadDriveFolderEntries(privateStateFolder.id);
  const timestampFolder = privateStateEntries
    .filter((entry) => entry.mimeType === driveFolderMimeType && timestampFolderNamePattern.test(entry.name))
    .sort((left, right) => right.name.localeCompare(left.name))[0];

  if (!timestampFolder) {
    throw new Error('Could not find any timestamp-named folders in the private-state Google Drive folder.');
  }

  const timestampEntries = await loadDriveFolderEntries(timestampFolder.id);
  const controllerCallableAbi = findDriveEntryByName(timestampEntries, privateStateControllerCallableAbiFilename, 'application/json');

  if (!controllerCallableAbi) {
    throw new Error('Could not find the required callable ABI artifact in Google Drive.');
  }

  return {
    deploymentFileId: selectSingleMatchingEntry(timestampEntries, deploymentManifestPattern, 'deployment manifest', 'application/json').id,
    storageLayoutFileId: selectSingleMatchingEntry(timestampEntries, storageLayoutManifestPattern, 'storage layout manifest', 'application/json').id,
    controllerCallableAbiFileId: controllerCallableAbi.id,
  };
};

const readDriveJson = async <T>(fileId: string): Promise<T> =>
  JSON.parse(await fetchText(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`)) as T;

const toExampleNetwork = (chainId: number): ExampleNetwork => {
  if (chainId === 1) {
    return 'mainnet';
  }
  if (chainId === 11155111) {
    return 'sepolia';
  }
  return 'anvil';
};

const makeLaunchEntryName = (functionName: string) => `Private-state ${functionName}`;

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
      account: wallet.address as Address,
    });
    participants.push({
      addressL1: wallet.address as Address,
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
    addressL1: fromEdwardsToAddress(keyMaterial.publicKeys[index]).toString() as Address,
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

const buildTransactionSnapshot = (
  context: ExampleContext,
  senderIndex: number,
  entryContractAddress: Address,
  calldata: Hex,
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

const createSyntheticSnapshot = async (
  storageAddresses: Address[],
  writes: StorageWrite[],
): Promise<StateSnapshot> => {
  const common = createTokamakL2Common();
  const normalizedStorageAddresses = storageAddresses.map((address) => ethers.getAddress(address) as Address);
  const addressObjects = normalizedStorageAddresses.map((address) => createAddressFromString(address));
  const merkleTrees = new TokamakL2MerkleTrees(addressObjects);
  const hashTrieNode = (trie: MerklePatriciaTrie, encoded: Uint8Array) =>
    (trie as unknown as { hash(value: Uint8Array): Uint8Array }).hash(encoded);
  const writesByAddress = new Map<Address, StorageWrite[]>();

  for (const address of normalizedStorageAddresses) {
    writesByAddress.set(address, []);
  }
  for (const write of writes) {
    const normalizedAddress = ethers.getAddress(write.address) as Address;
    const writesForAddress = writesByAddress.get(normalizedAddress);
    if (writesForAddress === undefined) {
      throw new Error(`Storage write targets unmanaged address ${normalizedAddress}`);
    }
    writesForAddress.push({
      ...write,
      address: normalizedAddress,
    });
  }

  const stateRoots: Hex[] = [];
  const storageKeys: Hex[][] = [];
  const storageTrieRoots: Hex[] = [];
  const storageTrieDb: Array<Array<{ key: Hex; value: Hex }>> = [];

  for (const [index, address] of normalizedStorageAddresses.entries()) {
    const trie = new MerklePatriciaTrie({
      useKeyHashing: true,
      common,
      db: new MapDB(),
    });
    const writesForAddress = writesByAddress.get(address) ?? [];
    const addressStorageKeys: Hex[] = [];

    for (const write of writesForAddress) {
      const keyBytes = hexToBytes(addHexPrefix(write.key));
      const normalizedValue = unpadBytes(hexToBytes(addHexPrefix(write.value)));
      await trie.put(keyBytes, RLP.encode(normalizedValue));
      merkleTrees.update(
        bytesToBigInt(addressObjects[index].bytes),
        bytesToBigInt(keyBytes),
        normalizedValue.length === 0 ? 0n : bytesToBigInt(normalizedValue),
      );
      addressStorageKeys.push(write.key);
    }

    const trieDbEntries: Array<{ key: Hex; value: Hex }> = [];
    const seenNodeKeys = new Set<string>();
    for await (const { node, currentKey } of trie.walkTrieIterable(trie.root())) {
      const encoded = node.serialize();
      const isRoot = currentKey.length === 0;
      if (!isRoot && encoded.length < 32) {
        continue;
      }
      const nodeKey = isRoot ? trie.root() : hashTrieNode(trie, encoded);
      const keyHex = bytesToHex(nodeKey) as Hex;
      if (seenNodeKeys.has(keyHex)) {
        continue;
      }
      seenNodeKeys.add(keyHex);
      trieDbEntries.push({
        key: keyHex,
        value: bytesToHex(encoded) as Hex,
      });
    }

    stateRoots.push(ethers.toBeHex(merkleTrees.getRoot(addressObjects[index])) as Hex);
    storageKeys.push(addressStorageKeys);
    storageTrieRoots.push(bytesToHex(trie.root()) as Hex);
    storageTrieDb.push(trieDbEntries);
  }

  return {
    channelId: defaultChannelId,
    stateRoots,
    storageAddresses: normalizedStorageAddresses,
    storageKeys,
    storageTrieRoots,
    storageTrieDb,
  };
};

const writeLaunchInput = async (
  outputDir: string,
  previousState: StateSnapshot,
  transaction: TxSnapshot,
  contractCodes: ContractCodeEntry[],
  name: string,
): Promise<LaunchManifestEntry> => {
  const previousStatePath = path.join(outputDir, 'previous_state_snapshot.json');
  const transactionPath = path.join(outputDir, 'transaction.json');
  const blockInfoPath = path.join(outputDir, 'block_info.json');
  const contractCodePath = path.join(outputDir, 'contract_codes.json');

  await writeJson(previousStatePath, previousState);
  await writeJson(transactionPath, transaction);
  await writeJson(blockInfoPath, staticBlockInfo);
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

const buildContractCodes = (manifest: DeploymentManifest): ContractCodeEntry[] => {
  return [
    {
      address: manifest.contracts.controller,
      code: manifest.deployedBytecode.controller,
    },
    {
      address: manifest.contracts.l2AccountingVault,
      code: manifest.deployedBytecode.l2AccountingVault,
    },
  ];
};

const selectorOf = (controllerInterface: ethers.Interface, functionName: string) => {
  const fragment = controllerInterface.getFunction(functionName);
  if (!fragment) {
    throw new Error(`Could not resolve ${functionName} from the Drive callable ABI.`);
  }
  return fragment.selector as Hex;
};

const buildMintManifest = async (
  context: ExampleContext,
  contractCodes: ContractCodeEntry[],
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
    const functionName = `mintNotes${outputCount}` as const;
    const noteValues = Array.from({ length: outputCount }, () =>
      ethers.toBeHex(defaultMintNoteValue) as Hex,
    ) as [Hex, ...Hex[]];
    const noteSalts = Array.from({ length: outputCount }, (_, index) =>
      deriveReplayPrivateStateFieldValue(
        `private-state-mint-sender-${senderIndex}-owner-${noteOwnerIndex}-output-${index}`,
      ),
    ) as [Hex, ...Hex[]];

    const calldata = buildPrivateStateMintCalldata(
      {
        network: context.exampleNetwork,
        participants: context.participants,
        storageConfigs: [],
        callCodeAddresses: [],
        blockNumber: Number(staticBlockInfo.blockNumber),
        txNonce: defaultTxNonce,
        calldata: '0x',
        senderIndex,
        noteOwnerIndex,
        outputCount,
        noteValues,
        noteSalts,
        function: {
          selector: selectorOf(context.controllerInterface, functionName),
          entryContractAddress: context.manifest.contracts.controller,
        },
      },
      context.keyMaterial,
    );

    const totalValue = defaultMintNoteValue * ethers.toBigInt(outputCount);
    const snapshot = await createSyntheticSnapshot(
      managedStorageAddresses,
      [{
        address: context.manifest.contracts.l2AccountingVault,
        key: computeReplayPrivateStateAddressMappingKey(senderAddress, liquidBalancesSlot),
        value: ethers.zeroPadValue(ethers.toBeHex(totalValue), 32) as Hex,
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
        path.resolve(examplesRoot, 'mintNotes', functionName),
        snapshot,
        transaction,
        contractCodes,
        makeLaunchEntryName(functionName),
      ),
    );
  }
  return entries;
};

const buildTransferManifest = async (
  context: ExampleContext,
  contractCodes: ContractCodeEntry[],
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
    const functionName = `transferNotes${inputCount}To${outputCount}`;
    const noteValue = defaultTransferValue(inputCount, outputCount);
    const inputValue = noteValue / ethers.toBigInt(inputCount);
    const outputValue = noteValue / ethers.toBigInt(outputCount);
    const inputValueHex = ethers.toBeHex(inputValue) as Hex;
    const outputValueHex = ethers.toBeHex(outputValue) as Hex;

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

    const calldata = buildPrivateStateTransferCalldata(
      {
        network: context.exampleNetwork,
        participants: context.participants,
        storageConfigs: [],
        callCodeAddresses: [],
        blockNumber: Number(staticBlockInfo.blockNumber),
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
          selector: selectorOf(context.controllerInterface, functionName),
          entryContractAddress: context.manifest.contracts.controller,
        },
      },
      context.keyMaterial,
    );

    const snapshot = await createSyntheticSnapshot(
      managedStorageAddresses,
      inputNotes.map((note) => ({
        address: context.manifest.contracts.controller,
        key: computeReplayPrivateStateMappingKey(
          computeReplayPrivateStateNoteCommitment(note as PrivateStateNoteLike),
          commitmentExistsSlot,
        ),
        value: ethers.zeroPadValue('0x01', 32) as Hex,
      })),
    );

    const transaction = buildTransactionSnapshot(
      context,
      senderIndex,
      context.manifest.contracts.controller,
      calldata,
    );
    entries.push(
      await writeLaunchInput(
        path.resolve(examplesRoot, 'transferNotes', functionName),
        snapshot,
        transaction,
        contractCodes,
        makeLaunchEntryName(functionName),
      ),
    );
  }

  return entries;
};

const buildRedeemManifest = async (
  context: ExampleContext,
  contractCodes: ContractCodeEntry[],
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
    const functionName = `redeemNotes${inputCount}` as
      | 'redeemNotes1'
      | 'redeemNotes2'
      | 'redeemNotes3'
      | 'redeemNotes4';
    const inputNotes = Array.from({ length: inputCount }, (_, index) => ({
      owner: senderAddress,
      value: ethers.toBeHex(defaultRedeemNoteValue) as Hex,
      salt: deriveReplayPrivateStateFieldValue(`private-state-redeem-input-sender-${senderIndex}-${index}`),
    })) as PrivateStateRedeemConfig['inputNotes'];

    const calldata = buildPrivateStateRedeemCalldata(
      {
        network: context.exampleNetwork,
        participants: context.participants,
        storageConfigs: [],
        callCodeAddresses: [],
        blockNumber: Number(staticBlockInfo.blockNumber),
        txNonce: defaultTxNonce,
        calldata: '0x',
        senderIndex,
        receiverIndex,
        inputCount,
        inputNotes,
        function: {
          selector: selectorOf(context.controllerInterface, functionName),
          entryContractAddress: context.manifest.contracts.controller,
        },
      },
      context.keyMaterial,
    );

    const snapshot = await createSyntheticSnapshot(
      managedStorageAddresses,
      inputNotes.map((note) => ({
        address: context.manifest.contracts.controller,
        key: computeReplayPrivateStateMappingKey(
          computeReplayPrivateStateNoteCommitment(note as PrivateStateNoteLike),
          commitmentExistsSlot,
        ),
        value: ethers.zeroPadValue('0x01', 32) as Hex,
      })),
    );

    const transaction = buildTransactionSnapshot(
      context,
      senderIndex,
      context.manifest.contracts.controller,
      calldata,
    );
    entries.push(
      await writeLaunchInput(
        path.resolve(examplesRoot, 'redeemNotes', functionName),
        snapshot,
        transaction,
        contractCodes,
        makeLaunchEntryName(functionName),
      ),
    );
  }

  return entries;
};

const main = async () => {
  const artifactIds = await resolveDriveArtifactIds();
  const manifest = await readDriveJson<DeploymentManifest>(artifactIds.deploymentFileId);
  const storageLayoutManifest = await readDriveJson<PrivateStateStorageLayoutManifest>(artifactIds.storageLayoutFileId);
  const controllerCallableAbi = await readDriveJson<ethers.InterfaceAbi>(artifactIds.controllerCallableAbiFileId);
  const mnemonic = defaultMnemonic;
  const { participants, keyMaterial } = await deriveChannelParticipants(defaultParticipantCount, mnemonic, manifest.chainId);

  const context: ExampleContext = {
    chainId: manifest.chainId,
    exampleNetwork: toExampleNetwork(manifest.chainId),
    manifest,
    storageLayoutManifest,
    controllerInterface: new ethers.Interface(controllerCallableAbi),
    participants,
    keyMaterial,
  };

  const contractCodes = buildContractCodes(manifest);
  const mintManifest = await buildMintManifest(context, contractCodes);
  const transferManifest = await buildTransferManifest(context, contractCodes);
  const redeemManifest = await buildRedeemManifest(context, contractCodes);

  await writeJson(path.resolve(examplesRoot, 'mintNotes', 'cli-launch-manifest.json'), mintManifest);
  await writeJson(path.resolve(examplesRoot, 'transferNotes', 'cli-launch-manifest.json'), transferManifest);
  await writeJson(path.resolve(examplesRoot, 'redeemNotes', 'cli-launch-manifest.json'), redeemManifest);

  console.log(
    JSON.stringify(
      {
        chainId: manifest.chainId,
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
