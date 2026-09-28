#!/usr/bin/env node
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { createPrivateStateAnvilFixture, stopPrivateStateAnvil } from './private-state-anvil-fixture.ts';

type Family = 'mint' | 'transfer' | 'redeem';

type FamilyDefinition = Readonly<{
  exampleType: 'private-state-mint' | 'private-state-transfer' | 'private-state-redeem';
  generatorFile: string;
}>;

type HostOrdering = 'canonical' | 'reverse';

type TopologyVariant = Readonly<{
  label: string;
  senderIndex: number;
  amount: string;
  channelTransactionIndex: number;
  hostOrdering: HostOrdering;
  noteOwnerIndex?: number;
  receiverIndex?: number;
  extraBalanceAccounts?: readonly number[];
  extraCommitments?: number;
  saltLabel?: string;
}>;

type TopologyVariantManifest = Readonly<{
  schemaVersion: 1;
  variants: Readonly<Record<Family, readonly TopologyVariant[]>>;
}>;

type MatrixConfig = Readonly<{
  network?: string;
  channelTransactionIndex?: number;
  function?: Readonly<{
    entryContractAddress?: string;
    selector?: string;
  }>;
  storageConfigs?: Array<{
    preAllocatedKeys?: string[];
  }>;
  callCodeAddresses?: string[];
}>;

class CommandFailure extends Error {
  public constructor(
    readonly output: string,
    command: string,
    code: number | null,
  ) {
    super(`${command} exited with code ${code ?? 'unknown'}`);
  }
}

const packageRoot = path.resolve(process.cwd());
const configRunner = path.resolve(packageRoot, '..', 'examples', 'config-runner.ts');
const outputDir = path.resolve(packageRoot, '..', 'outputs');
const errorLogPattern = /error:/iu;
const topologyVariantManifestPath = path.resolve(
  packageRoot,
  'tests',
  'fixtures',
  'private-state-topology-variants.json',
);

const familyDefinitions: Readonly<Record<Family, FamilyDefinition>> = {
  mint: {
    exampleType: 'private-state-mint',
    generatorFile: 'generate-private-state-mint-config.ts',
  },
  transfer: {
    exampleType: 'private-state-transfer',
    generatorFile: 'generate-private-state-transfer-config.ts',
  },
  redeem: {
    exampleType: 'private-state-redeem',
    generatorFile: 'generate-private-state-redeem-config.ts',
  },
};

const runCaptured = async (command: string, args: readonly string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { cwd: packageRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const appendOutput = (chunk: Buffer | string) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    };
    child.stdout.on('data', appendOutput);
    child.stderr.on('data', appendOutput);
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve(output);
        return;
      }
      reject(new CommandFailure(output, command, code));
    });
  });

const normalize = (value: string | undefined): string => value?.trim().toLowerCase() ?? '';

const loadTopologyVariantManifest = async (): Promise<TopologyVariantManifest> => {
  const manifest = JSON.parse(await fs.readFile(topologyVariantManifestPath, 'utf8')) as TopologyVariantManifest;
  if (manifest.schemaVersion !== 1) {
    throw new Error(`Unsupported private-state topology manifest schema: ${String(manifest.schemaVersion)}`);
  }
  for (const family of Object.keys(familyDefinitions) as Family[]) {
    if (manifest.variants[family]?.length < 2) {
      throw new Error(`Private-state topology manifest needs at least two ${family} variants`);
    }
  }
  return manifest;
};

const groupKey = (config: MatrixConfig): string =>
  [
    normalize(config.network),
    normalize(config.function?.entryContractAddress),
    normalize(config.function?.selector),
  ].join('|');

const copyOutput = async (destination: string): Promise<void> => {
  await fs.mkdir(destination, { recursive: true });
  for (const entry of await fs.readdir(outputDir)) {
    await fs.cp(path.join(outputDir, entry), path.join(destination, entry), { recursive: true });
  }
};

const applyVariantToConfig = (config: MatrixConfig, variant: TopologyVariant): MatrixConfig => {
  const mutableConfig = config as {
    storageConfigs?: Array<{ preAllocatedKeys?: string[] }>;
    callCodeAddresses?: string[];
  };
  if (config.channelTransactionIndex !== variant.channelTransactionIndex) {
    throw new Error(`Topology fixture channel transaction index mismatch for ${variant.label}`);
  }
  if (variant.hostOrdering === 'reverse') {
    mutableConfig.storageConfigs?.reverse();
    mutableConfig.callCodeAddresses?.reverse();
    for (const storageConfig of mutableConfig.storageConfigs ?? []) {
      storageConfig.preAllocatedKeys?.reverse();
    }
  }
  return config;
};

const variantGeneratorArgs = (
  family: Family,
  familyArgs: readonly string[],
  variant: TopologyVariant,
  configPath: string,
  deploymentManifestPath: string,
  storageLayoutPath: string,
): string[] => {
  const args = [
    '--output',
    configPath,
    '--participants',
    '4',
    '--sender',
    String(variant.senderIndex),
    '--channel-transaction-index',
    String(variant.channelTransactionIndex),
    '--amount',
    variant.amount,
    '--deployment-manifest',
    deploymentManifestPath,
    '--storage-layout',
    storageLayoutPath,
    ...familyArgs,
  ];
  if (family === 'mint') {
    args.push('--note-owner', String(variant.noteOwnerIndex ?? variant.senderIndex));
    const extraBalanceAccounts = variant.extraBalanceAccounts ?? [];
    if (extraBalanceAccounts.length > 0) {
      args.push('--extra-balance-accounts', extraBalanceAccounts.join(','));
    }
  }
  if (family === 'transfer') {
    args.push('--extra-commitments', String(variant.extraCommitments ?? 0));
    args.push('--salt-label', variant.saltLabel ?? variant.label);
  }
  if (family === 'redeem') {
    args.push('--receiver', String(variant.receiverIndex ?? variant.senderIndex));
    const extraBalanceAccounts = variant.extraBalanceAccounts ?? [];
    if (extraBalanceAccounts.length > 0) {
      args.push('--extra-balance-accounts', extraBalanceAccounts.join(','));
    }
    args.push('--extra-commitments', String(variant.extraCommitments ?? 0));
  }
  return args;
};

const assertNoOutputErrors = (output: string, configName: string): void => {
  const errors = output.split(/\r?\n/u).filter(line => errorLogPattern.test(line));
  if (errors.length > 0) {
    throw new Error(`Final execution emitted error logs for ${configName}:\n${errors.join('\n')}`);
  }
};

const comparePermutations = async (
  archiveDir: string,
  configNames: readonly string[],
  key: string,
): Promise<boolean> => {
  if (configNames.length < 2) {
    console.log(`[private-state-topology] Unverified group ${key}: fewer than two successful members`);
    return false;
  }

  const baselineName = configNames[0];
  const baseline = await fs.readFile(path.join(archiveDir, baselineName, 'permutation.json'));
  for (const configName of configNames.slice(1)) {
    const candidate = await fs.readFile(path.join(archiveDir, configName, 'permutation.json'));
    if (!baseline.equals(candidate)) {
      throw new Error(`Permutation mismatch for ${key}: baseline=${baselineName} mismatch=${configName}`);
    }
  }
  return true;
};

const runFamily = async (
  family: Family,
  familyArgs: readonly string[],
  variants: readonly TopologyVariant[],
): Promise<void> => {
  const definition = familyDefinitions[family];
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `tokamak-${family}-topology-`));
  const archiveDir = path.join(workDir, 'outputs');

  try {
    const groups = new Set<string>();
    const successfulVariants: string[] = [];
    for (const variant of variants) {
      const configName = `${family}-${variant.label}.json`;
      const configPath = path.join(workDir, configName);
      let anvilMayBeRunning = false;
      try {
        console.log(`[private-state-topology] Preparing ${family}/${variant.label}`);
        anvilMayBeRunning = true;
        const fixture = await createPrivateStateAnvilFixture(packageRoot, `${family}-${variant.label}`);
        await runCaptured('tsx', [
          '--tsconfig',
          path.resolve(packageRoot, 'tsconfig.dev.json'),
          path.resolve(packageRoot, 'scripts', definition.generatorFile),
          ...variantGeneratorArgs(
            family,
            familyArgs,
            variant,
            configPath,
            fixture.deploymentManifestPath,
            fixture.storageLayoutPath,
          ),
        ]);
        const config = applyVariantToConfig(JSON.parse(await fs.readFile(configPath, 'utf8')) as MatrixConfig, variant);
        await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
        groups.add(groupKey(config));
        console.log(`[private-state-topology] Running ${configName}`);
        const output = await runCaptured('tsx', [
          '--tsconfig',
          path.resolve(packageRoot, 'tsconfig.dev.json'),
          configRunner,
          definition.exampleType,
          configPath,
        ]);
        assertNoOutputErrors(output, configName);
        const variantArchiveDir = path.join(archiveDir, path.parse(configName).name);
        await copyOutput(variantArchiveDir);
        await fs.copyFile(configPath, path.join(variantArchiveDir, 'config.json'));
        successfulVariants.push(path.parse(configName).name);
      } finally {
        if (anvilMayBeRunning) {
          await stopPrivateStateAnvil(packageRoot);
        }
      }
    }

    if (groups.size !== 1) {
      throw new Error(`Private-state ${family} matrix does not share one network/contract/selector group`);
    }
    const key = groups.values().next().value as string;
    if (await comparePermutations(archiveDir, successfulVariants, key)) {
      console.log(`[private-state-topology] Topology verified for ${family}: ${successfulVariants.join(', ')}`);
    }
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
};

const fullMatrix: readonly Readonly<{ family: Family; args: readonly string[] }>[] = [
  { family: 'mint', args: ['--outputs', '1'] },
  { family: 'mint', args: ['--outputs', '2'] },
  { family: 'mint', args: ['--outputs', '3'] },
  { family: 'transfer', args: ['--inputs', '1', '--outputs', '1'] },
  { family: 'transfer', args: ['--inputs', '1', '--outputs', '2'] },
  { family: 'transfer', args: ['--inputs', '1', '--outputs', '3'] },
  { family: 'transfer', args: ['--inputs', '2', '--outputs', '1'] },
  { family: 'transfer', args: ['--inputs', '2', '--outputs', '2'] },
  { family: 'redeem', args: ['--inputs', '1'] },
  { family: 'redeem', args: ['--inputs', '2'] },
];

const main = async (): Promise<void> => {
  const [requestedFamily, ...familyArgs] = process.argv.slice(2);
  const manifest = await loadTopologyVariantManifest();
  if (requestedFamily === 'all') {
    for (const entry of fullMatrix) {
      await runFamily(entry.family, entry.args, manifest.variants[entry.family]);
    }
    return;
  }
  if (requestedFamily !== 'mint' && requestedFamily !== 'transfer' && requestedFamily !== 'redeem') {
    throw new Error('Usage: run-private-state-topology-matrix.ts <all|mint|transfer|redeem> [family options]');
  }
  await runFamily(requestedFamily, familyArgs, manifest.variants[requestedFamily]);
};

void main().catch(error => {
  console.error(error);
  process.exit(1);
});
