import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

export type SolidityStorageLayout = {
  storage: Array<{
    contract: string;
    label: string;
    offset: number;
    slot: string;
    type: string;
  }>;
  types: Record<
    string,
    {
      encoding: string;
      key?: string;
      label: string;
      numberOfBytes: string;
      value?: string;
    }
  >;
};

export type PrivateStateStorageLayoutManifest = {
  generatedAtUtc: string;
  chainId: number;
  contracts: Record<
    string,
    {
      address: `0x${string}`;
      sourceName: string;
      contractName: string;
      storageLayout: SolidityStorageLayout;
    }
  >;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..', '..', '..', '..');
const defaultStorageLayoutPath = path.resolve(
  repoRoot,
  'apps',
  'private-state',
  'deploy',
  'storage-layout.31337.latest.json',
);

export const loadPrivateStateStorageLayoutManifest = async (
  manifestPath = defaultStorageLayoutPath,
): Promise<PrivateStateStorageLayoutManifest> => {
  const contents = await fs.readFile(manifestPath, 'utf8');
  return JSON.parse(contents) as PrivateStateStorageLayoutManifest;
};

const getLayoutEntry = (
  manifest: PrivateStateStorageLayoutManifest,
  contractName: keyof PrivateStateStorageLayoutManifest['contracts'] | string,
  label: string,
) => {
  const contract = manifest.contracts[contractName];
  if (contract === undefined) {
    throw new Error(`Unknown private-state storage-layout contract: ${String(contractName)}`);
  }
  const entry = contract.storageLayout.storage.find((candidate) => candidate.label === label);
  if (entry === undefined) {
    throw new Error(`Missing storage-layout entry ${String(contractName)}.${label}`);
  }
  return entry;
};

export const getPrivateStateControllerCommitmentExistsSlot = (
  manifest: PrivateStateStorageLayoutManifest,
): bigint => BigInt(getLayoutEntry(manifest, 'PrivateStateController', 'commitmentExists').slot);

export const getPrivateStateControllerNullifierUsedSlot = (
  manifest: PrivateStateStorageLayoutManifest,
): bigint => BigInt(getLayoutEntry(manifest, 'PrivateStateController', 'nullifierUsed').slot);

export const getPrivateStateVaultLiquidBalancesSlot = (
  manifest: PrivateStateStorageLayoutManifest,
): bigint => BigInt(getLayoutEntry(manifest, 'L2AccountingVault', 'liquidBalances').slot);
