import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runTokamakChannelTxFromFiles } from '../src/cli/tokamakChTx.ts';

type ManifestEntry = {
  name: string;
  files: {
    previousState: string;
    transaction: string;
    blockInfo: string;
    contractCode: string;
  };
};

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

async function loadManifest(manifestPath: string): Promise<ManifestEntry[]> {
  return JSON.parse(await fs.readFile(manifestPath, 'utf8')) as ManifestEntry[];
}

function resolveEntry(
  entries: ManifestEntry[],
  selector?: string,
): ManifestEntry {
  if (selector === undefined) {
    const firstEntry = entries[0];
    if (firstEntry === undefined) {
      throw new Error('Manifest must contain at least one entry');
    }
    return firstEntry;
  }

  const byIndex = Number(selector);
  if (Number.isInteger(byIndex) && byIndex >= 0 && byIndex < entries.length) {
    const selectedByIndex = entries[byIndex];
    if (selectedByIndex !== undefined) {
      return selectedByIndex;
    }
  }

  const selectedByName = entries.find((entry) => entry.name === selector);
  if (selectedByName !== undefined) {
    return selectedByName;
  }

  throw new Error(`No manifest entry matched selector: ${selector}`);
}

async function main(): Promise<void> {
  const manifestPathArg = process.argv[2];
  const selector = process.argv[3];

  if (manifestPathArg === undefined) {
    throw new Error(
      'Manifest path required. Usage: tsx examples/manifest-runner.ts <manifest.json> [entry-name-or-index]',
    );
  }

  const manifestPath = path.resolve(manifestPathArg);
  const manifestEntries = await loadManifest(manifestPath);
  const selectedEntry = resolveEntry(manifestEntries, selector);

  await runTokamakChannelTxFromFiles({
    previousState: path.resolve(packageRoot, selectedEntry.files.previousState),
    transaction: path.resolve(packageRoot, selectedEntry.files.transaction),
    blockInfo: path.resolve(packageRoot, selectedEntry.files.blockInfo),
    contractCode: path.resolve(packageRoot, selectedEntry.files.contractCode),
  });
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
