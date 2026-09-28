import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  digestSubcircuitSourceEntries,
  validateSubcircuitSourceDigest,
} from '../packages/backend/common/contracts/typescript/subcircuit-source-digest.ts';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      repositoryRoot,
      'packages/backend/common/contracts/fixtures/subcircuit-source-digest-vectors.json',
    ),
    'utf8',
  ),
) as {
  vectors: readonly {
    name: string;
    entries: readonly { path: string; contentHex: string }[];
    expected: string;
  }[];
};

for (const vector of fixture.vectors) {
  const entries = vector.entries.map(entry => ({
    path: entry.path,
    content: Buffer.from(entry.contentHex, 'hex'),
  }));
  const actual = digestSubcircuitSourceEntries(entries);
  if (actual !== vector.expected) {
    throw new Error(`${vector.name}: expected ${vector.expected}, received ${actual}.`);
  }
  const reversed = digestSubcircuitSourceEntries([...entries].reverse());
  if (reversed !== vector.expected) {
    throw new Error(`${vector.name}: digest changed when input order changed.`);
  }
  validateSubcircuitSourceDigest(actual);
}

console.log('[source-digest] Cross-language fixed vectors passed.');
