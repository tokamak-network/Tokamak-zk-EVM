#!/usr/bin/env node
/* eslint-disable no-console */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import {
  addHexPrefix,
  bytesToHex,
  createAddressFromString,
  hexToBytes,
} from '@ethereumjs/util';
import {
  createTokamakL2Common,
  createStateManagerOptsFromChannelConfig,
  createTokamakL2StateManagerFromL1RPC,
  createTokamakL2Tx,
  type StateSnapshot,
  type TokamakL2TxData,
} from 'tokamak-l2js';
import { NUMBER_OF_PREV_BLOCK_HASHES } from '../src/interface/qapCompiler/importedConstants.ts';
import { getBlockInfoFromRPC } from '../src/interface/rpc/rpc.ts';
import type { SynthesizerBlockInfo } from '../src/interface/rpc/types.ts';
import {
  deriveParticipantKeys,
  getExampleRpcUrl,
  loadConfig as loadMintConfig,
  toStateManagerChannelConfig as toMintChannelConfig,
} from '../examples/privateStateMint/utils.ts';
import {
  loadConfig as loadTransferConfig,
  toStateManagerChannelConfig as toTransferChannelConfig,
} from '../examples/privateStateTransfer/utils.ts';
import {
  loadConfig as loadRedeemConfig,
  toStateManagerChannelConfig as toRedeemChannelConfig,
} from '../examples/privateStateRedeem/utils.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..', '..', '..', '..');
const privateStateAppDir = path.resolve(repoRoot, 'apps', 'private-state');
const tsconfigPath = path.resolve(packageRoot, 'tsconfig.dev.json');
const launchJsonPath = path.resolve(packageRoot, '.vscode', 'launch.json');
const defaultChannelId = 4;

type CliInputFileSet = {
  previousState: string;
  blockInfo: string;
  contractCode: string;
};

type LaunchManifestEntry = {
  name: string;
  transactionRlp: `0x${string}`;
  files: CliInputFileSet;
};

type BaseConfigShape = {
  network: 'mainnet' | 'sepolia' | 'anvil';
  participants: { addressL1: `0x${string}`; prvSeedL2: string }[];
  storageConfigs: { address: `0x${string}`; userStorageSlots: number[]; preAllocatedKeys: `0x${string}`[] }[];
  callCodeAddresses: `0x${string}`[];
  blockNumber: number;
  txNonce: number;
  calldata: `0x${string}`;
  senderIndex: number;
  function: {
    selector: `0x${string}`;
    entryContractAddress: `0x${string}`;
  };
};

type ConfigLoader<TConfig extends BaseConfigShape> = (configPath: string) => Promise<TConfig>;
type ChannelConfigMapper<TConfig extends BaseConfigShape> = (config: TConfig) => {
  network: TConfig['network'];
  participants: TConfig['participants'];
  storageConfigs: TConfig['storageConfigs'];
  callCodeAddresses: TConfig['callCodeAddresses'];
  blockNumber: TConfig['blockNumber'];
};

type ExportSpec<TConfig extends BaseConfigShape> = {
  launchName: string;
  configPath: string;
  outputDir: string;
  loadConfig: ConfigLoader<TConfig>;
  toChannelConfig: ChannelConfigMapper<TConfig>;
};

type ParsedArgs = {
  skipBootstrap: boolean;
};

const parseArgs = (): ParsedArgs => {
  const parsed: ParsedArgs = { skipBootstrap: false };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--skip-bootstrap') {
      parsed.skipBootstrap = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
};

const runCommand = (command: string, args: string[], cwd = repoRoot) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code ?? 'unknown'}`));
      }
    });
  });

const toRelativePackagePath = (targetPath: string) =>
  path.relative(packageRoot, targetPath).split(path.sep).join('/');

const writeJsonFile = async (filePath: string, value: unknown) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const assignChannelId = (
  stateManager: Awaited<ReturnType<typeof createTokamakL2StateManagerFromL1RPC>>,
  channelId: number,
) => {
  (stateManager as Awaited<ReturnType<typeof createTokamakL2StateManagerFromL1RPC>> & { _channelId?: number })._channelId = channelId;
};

const syncLaunchJson = async (manifestEntries: LaunchManifestEntry[]) => {
  const launchJson = JSON.parse(await fs.readFile(launchJsonPath, 'utf8')) as {
    configurations?: Array<{ name?: string; args?: string[] }>;
  };
  if (!Array.isArray(launchJson.configurations)) {
    throw new Error(`Expected launch configurations in ${launchJsonPath}`);
  }

  const manifestByName = new Map(manifestEntries.map((entry) => [entry.name, entry]));
  for (const configuration of launchJson.configurations) {
    if (typeof configuration.name !== 'string') {
      continue;
    }
    const manifest = manifestByName.get(configuration.name);
    if (manifest === undefined || !Array.isArray(configuration.args)) {
      continue;
    }
    for (let index = 0; index < configuration.args.length; index += 1) {
      switch (configuration.args[index]) {
        case '--previous-state':
          configuration.args[index + 1] = `\${workspaceFolder}/${manifest.files.previousState}`;
          break;
        case '--transaction':
          configuration.args[index + 1] = manifest.transactionRlp;
          break;
        case '--block-info':
          configuration.args[index + 1] = `\${workspaceFolder}/${manifest.files.blockInfo}`;
          break;
        case '--contract-code':
          configuration.args[index + 1] = `\${workspaceFolder}/${manifest.files.contractCode}`;
          break;
        default:
          break;
      }
    }
  }

  await fs.writeFile(launchJsonPath, `${JSON.stringify(launchJson, null, 2)}\n`, 'utf8');
};

const exportCliLaunchInput = async <TConfig extends BaseConfigShape>(
  spec: ExportSpec<TConfig>,
): Promise<LaunchManifestEntry> => {
  const config = await spec.loadConfig(spec.configPath);
  const rpcUrl = getExampleRpcUrl(config.network, process.env);
  const keyMaterial = deriveParticipantKeys(config.participants);
  const senderPrivateKey = keyMaterial.privateKeys[config.senderIndex];
  const senderPublicKey = keyMaterial.publicKeys[config.senderIndex];
  if (senderPrivateKey === undefined || senderPublicKey === undefined) {
    throw new Error(`senderIndex must point to an existing participant; got ${config.senderIndex}`);
  }

  const stateManagerOpts = createStateManagerOptsFromChannelConfig(spec.toChannelConfig(config));
  const stateManager = await createTokamakL2StateManagerFromL1RPC(rpcUrl, stateManagerOpts);
  const blockInfo = await getBlockInfoFromRPC(rpcUrl, config.blockNumber, NUMBER_OF_PREV_BLOCK_HASHES);
  const common = createTokamakL2Common();

  const txData: TokamakL2TxData = {
    nonce: BigInt(config.txNonce),
    to: createAddressFromString(config.function.entryContractAddress),
    data: hexToBytes(config.calldata),
    senderPubKey: senderPublicKey.toBytes(),
  };
  const unsignedTransaction = createTokamakL2Tx(txData, { common });
  const signedTransaction = unsignedTransaction.sign(senderPrivateKey);
  const transactionRlp = addHexPrefix(bytesToHex(signedTransaction.serialize())) as `0x${string}`;

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contractCodes = await Promise.all(
    config.callCodeAddresses.map(async (address) => ({
      address,
      code: await provider.getCode(address, config.blockNumber),
    })),
  );
  assignChannelId(stateManager, defaultChannelId);
  const previousState = await stateManager.captureStateSnapshot();

  const previousStatePath = path.join(spec.outputDir, 'previous_state_snapshot.json');
  const blockInfoPath = path.join(spec.outputDir, 'block_info.json');
  const contractCodePath = path.join(spec.outputDir, 'contract_codes.json');

  await writeJsonFile(previousStatePath, previousState);
  await writeJsonFile(blockInfoPath, blockInfo satisfies SynthesizerBlockInfo);
  await writeJsonFile(contractCodePath, contractCodes);

  return {
    name: spec.launchName,
    transactionRlp,
    files: {
      previousState: toRelativePackagePath(previousStatePath),
      blockInfo: toRelativePackagePath(blockInfoPath),
      contractCode: toRelativePackagePath(contractCodePath),
    },
  };
};

const runBootstrap = async () => {
  await runCommand('make', ['-C', privateStateAppDir, 'anvil-stop']);
  await runCommand('make', ['-C', privateStateAppDir, 'anvil-start']);
  await runCommand('make', ['-C', privateStateAppDir, 'anvil-bootstrap']);
};

const generateConfigs = async () => {
  const mintConfigDir = path.resolve(packageRoot, 'tests', 'configs', 'private-state-mint');
  const transferConfigDir = path.resolve(packageRoot, 'tests', 'configs', 'private-state-transfer');
  const redeemConfigDir = path.resolve(packageRoot, 'tests', 'configs', 'private-state-redeem');

  await fs.mkdir(mintConfigDir, { recursive: true });
  await fs.mkdir(transferConfigDir, { recursive: true });
  await fs.mkdir(redeemConfigDir, { recursive: true });

  for (const outputs of [1, 2, 3, 4, 5, 6] as const) {
    await runCommand('tsx', [
      '--tsconfig',
      tsconfigPath,
      path.resolve(packageRoot, 'scripts', 'generate-private-state-mint-config.ts'),
      '--output',
      path.join(mintConfigDir, `config-anvil-private-state-mint-m${outputs}-p4-s0.json`),
      '--participants',
      '4',
      '--sender',
      '0',
      '--note-owner',
      '0',
      '--outputs',
      String(outputs),
    ]);
  }

  for (const [inputs, outputs] of [
    [1, 1],
    [1, 2],
    [1, 3],
    [2, 1],
    [2, 2],
    [3, 1],
    [3, 2],
    [4, 1],
  ] as const) {
    await runCommand('tsx', [
      '--tsconfig',
      tsconfigPath,
      path.resolve(packageRoot, 'scripts', 'generate-private-state-transfer-config.ts'),
      '--output',
      path.join(transferConfigDir, `config-anvil-private-state-transfer-n${inputs}-m${outputs}-p4-s0.json`),
      '--participants',
      '4',
      '--sender',
      '0',
      '--inputs',
      String(inputs),
      '--outputs',
      String(outputs),
    ]);
  }

  for (const inputs of [1, 2, 3, 4] as const) {
    await runCommand('tsx', [
      '--tsconfig',
      tsconfigPath,
      path.resolve(packageRoot, 'scripts', 'generate-private-state-redeem-config.ts'),
      '--output',
      path.join(redeemConfigDir, `config-anvil-private-state-redeem-n${inputs}-p4-s0.json`),
      '--participants',
      '4',
      '--sender',
      '0',
      '--inputs',
      String(inputs),
    ]);
  }
};

const main = async () => {
  const { skipBootstrap } = parseArgs();

  if (!skipBootstrap) {
    await runBootstrap();
  }
  await generateConfigs();

  const mintSpecs: ExportSpec<BaseConfigShape>[] = [1, 2, 3, 4, 5, 6].map((outputs) => ({
    launchName: `Private-state mintNotes${outputs} on anvil`,
    configPath: path.resolve(
      packageRoot,
      'tests',
      'configs',
      'private-state-mint',
      `config-anvil-private-state-mint-m${outputs}-p4-s0.json`,
    ),
    outputDir: path.resolve(packageRoot, 'examples', 'privateStateMint', `mintNotes${outputs}`),
    loadConfig: loadMintConfig as ConfigLoader<BaseConfigShape>,
    toChannelConfig: toMintChannelConfig as ChannelConfigMapper<BaseConfigShape>,
  }));

  const transferSpecs: ExportSpec<BaseConfigShape>[] = [
    [1, 1],
    [1, 2],
    [1, 3],
    [2, 1],
    [2, 2],
    [3, 1],
    [3, 2],
    [4, 1],
  ].map(([inputs, outputs]) => ({
    launchName: `Private-state transferNotes${inputs}To${outputs} on anvil`,
    configPath: path.resolve(
      packageRoot,
      'tests',
      'configs',
      'private-state-transfer',
      `config-anvil-private-state-transfer-n${inputs}-m${outputs}-p4-s0.json`,
    ),
    outputDir: path.resolve(packageRoot, 'examples', 'privateStateTransfer', `transferNotes${inputs}To${outputs}`),
    loadConfig: loadTransferConfig as ConfigLoader<BaseConfigShape>,
    toChannelConfig: toTransferChannelConfig as ChannelConfigMapper<BaseConfigShape>,
  }));

  const redeemSpecs: ExportSpec<BaseConfigShape>[] = [1, 2, 3, 4].map((inputs) => ({
    launchName: `Private-state redeemNotes${inputs} on anvil`,
    configPath: path.resolve(
      packageRoot,
      'tests',
      'configs',
      'private-state-redeem',
      `config-anvil-private-state-redeem-n${inputs}-p4-s0.json`,
    ),
    outputDir: path.resolve(packageRoot, 'examples', 'privateStateRedeem', `redeemNotes${inputs}`),
    loadConfig: loadRedeemConfig as ConfigLoader<BaseConfigShape>,
    toChannelConfig: toRedeemChannelConfig as ChannelConfigMapper<BaseConfigShape>,
  }));

  const mintManifest = await Promise.all(mintSpecs.map((spec) => exportCliLaunchInput(spec)));
  const transferManifest = await Promise.all(transferSpecs.map((spec) => exportCliLaunchInput(spec)));
  const redeemManifest = await Promise.all(redeemSpecs.map((spec) => exportCliLaunchInput(spec)));

  await writeJsonFile(
    path.resolve(packageRoot, 'examples', 'privateStateMint', 'cli-launch-manifest.json'),
    mintManifest,
  );
  await writeJsonFile(
    path.resolve(packageRoot, 'examples', 'privateStateTransfer', 'cli-launch-manifest.json'),
    transferManifest,
  );
  await writeJsonFile(
    path.resolve(packageRoot, 'examples', 'privateStateRedeem', 'cli-launch-manifest.json'),
    redeemManifest,
  );
  await syncLaunchJson([...mintManifest, ...transferManifest, ...redeemManifest]);

  console.log(JSON.stringify({ mintManifest, transferManifest, redeemManifest }, null, 2));
};

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
