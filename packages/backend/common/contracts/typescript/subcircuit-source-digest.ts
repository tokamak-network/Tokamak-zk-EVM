import { createHash } from 'node:crypto';

export interface SubcircuitSourceDigestEntry {
  readonly path: string;
  readonly content: Uint8Array;
}

const SOURCE_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

export function digestSubcircuitSourceEntries(entries: readonly SubcircuitSourceDigestEntry[]): string {
  const framed = entries
    .map(entry => {
      const path = Buffer.from(entry.path, 'utf8');
      if (path.toString('utf8') !== entry.path) {
        throw new Error('Subcircuit source digest path must have a canonical UTF-8 encoding.');
      }
      return { path, content: Buffer.from(entry.content) };
    })
    .sort((left, right) => Buffer.compare(left.path, right.path));
  const digest = createHash('sha256');
  let previousPath: Buffer | undefined;

  for (const entry of framed) {
    validatePath(entry.path);
    if (previousPath !== undefined && Buffer.compare(previousPath, entry.path) === 0) {
      throw new Error(`Subcircuit source digest repeats path ${JSON.stringify(entry.path.toString('utf8'))}.`);
    }
    previousPath = entry.path;
    digest.update(u64be(entry.path.byteLength));
    digest.update(entry.path);
    digest.update(u64be(entry.content.byteLength));
    digest.update(entry.content);
  }

  return `sha256:${digest.digest('hex')}`;
}

export function validateSubcircuitSourceDigest(value: string): void {
  if (!SOURCE_DIGEST_PATTERN.test(value)) {
    throw new Error('Subcircuit source digest must use sha256:<64 lowercase hexadecimal characters>.');
  }
}

function u64be(value: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Subcircuit source digest frame length must be a non-negative safe integer.');
  }
  const output = Buffer.alloc(8);
  output.writeBigUInt64BE(BigInt(value));
  return output;
}

function validatePath(bytes: Buffer): void {
  const value = bytes.toString('utf8');
  if (
    !value.startsWith('subcircuits/') ||
    value.includes('\\') ||
    value.split('/').some(segment => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    throw new Error(`Subcircuit source digest path must be a package-relative POSIX path below subcircuits/: ${JSON.stringify(value)}.`);
  }
}
