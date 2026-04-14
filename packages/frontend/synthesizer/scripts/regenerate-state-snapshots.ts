#!/usr/bin/env node
/* eslint-disable no-console */

import fs from 'fs/promises';
import path from 'path';
import {
  TokamakL2StateManager,
  createTokamakL2Common,
  type StateSnapshot,
} from 'tokamak-l2js';
import {
  bytesToBigInt,
  createAddressFromString,
  hexToBytes,
} from '@ethereumjs/util';

type LegacyStorageEntry = {
  key: string;
  value: string;
};

type LegacyStateSnapshot = {
  channelId: number;
  stateRoots: string[];
  storageAddresses: string[];
  storageEntries: LegacyStorageEntry[][];
};

type ContractCodeEntry = {
  address: string;
  code: string;
};

const packageRoot = process.cwd();

const walk = async (dir: string, predicate: (filePath: string) => boolean): Promise<string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const paths = await Promise.all(entries.map(async (entry) => {
    const resolved = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(resolved, predicate);
    }
    return predicate(resolved) ? [resolved] : [];
  }));
  return paths.flat();
};

const isLegacySnapshot = (value: unknown): value is LegacyStateSnapshot => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return Array.isArray((value as LegacyStateSnapshot).storageEntries);
};

const readJson = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await fs.readFile(filePath, 'utf8')) as T;

const writeJson = async (filePath: string, value: unknown) => {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const regenerateSnapshot = async (snapshotPath: string) => {
  const snapshot = await readJson<LegacyStateSnapshot | StateSnapshot>(snapshotPath);
  if (!isLegacySnapshot(snapshot)) {
    return false;
  }

  const contractCodesPath = path.join(path.dirname(snapshotPath), 'contract_codes.json');
  const contractCodes = await fs.access(contractCodesPath)
    .then(() => readJson<ContractCodeEntry[]>(contractCodesPath))
    .catch(() => [] as ContractCodeEntry[]);
  const storageAddresses = snapshot.storageAddresses.map((address) => createAddressFromString(address));

  const stateManager = new TokamakL2StateManager({ common: createTokamakL2Common() }) as TokamakL2StateManager & {
    _channelId?: number;
    _initializeForAddresses(addresses: ReturnType<typeof createAddressFromString>[]): Promise<void>;
  };

  await stateManager._initializeForAddresses(storageAddresses);
  stateManager._channelId = snapshot.channelId;

  for (const address of storageAddresses) {
    stateManager.storageEntries.set(bytesToBigInt(address.bytes), new Map());
  }

  for (const contractCode of contractCodes) {
    await stateManager.putCode(
      createAddressFromString(contractCode.address),
      hexToBytes(contractCode.code),
    );
  }

  for (const [addressIndex, address] of storageAddresses.entries()) {
    for (const entry of snapshot.storageEntries[addressIndex] ?? []) {
      await stateManager.putStorage(
        address,
        hexToBytes(entry.key),
        hexToBytes(entry.value),
      );
    }
  }

  const regeneratedSnapshot = await stateManager.captureStateSnapshot();
  await writeJson(snapshotPath, regeneratedSnapshot);
  console.log(`[regen-snapshots] Rewrote ${path.relative(packageRoot, snapshotPath)}`);
  return true;
};

const main = async () => {
  const snapshotPaths = [
    ...await walk(
      path.resolve(packageRoot, 'examples'),
      (filePath) => path.basename(filePath) === 'previous_state_snapshot.json',
    ),
    ...await walk(
      path.resolve(packageRoot, 'tests', 'outputs'),
      (filePath) => path.basename(filePath) === 'state_snapshot.json',
    ),
  ];

  let regeneratedCount = 0;
  for (const snapshotPath of snapshotPaths.sort((left, right) => left.localeCompare(right))) {
    if (await regenerateSnapshot(snapshotPath)) {
      regeneratedCount += 1;
    }
  }

  console.log(`[regen-snapshots] Regenerated ${regeneratedCount} example snapshot file(s).`);
};

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
