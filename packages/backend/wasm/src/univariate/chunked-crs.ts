import { sha256 } from "@noble/hashes/sha256";

import { assertCrsChunkCompatibility } from "../artifacts/binary/compatibility.js";
import { UNIVARIATE_CRS_CHUNK_CONTRACT } from "../generated/univariate-crs-chunk-contract.generated.js";

export type UnivariateCrsRole = keyof typeof UNIVARIATE_CRS_CHUNK_CONTRACT.roles;

export interface UnivariateCrsChunkInput {
  readonly manifest: unknown;
  readonly loadChunk: (relativePath: string) => Promise<Uint8Array>;
}

export interface UnivariateCrsChunkSection {
  readonly label: string;
  readonly encoding: string;
  readonly elementCount: number;
  readonly elementByteLength: number;
  readElement(index: number): Promise<Uint8Array>;
  readElements(firstElement: number, elementCount: number): Promise<Uint8Array>;
  readStridedElements(firstElement: number, stride: number, elementCount: number): Promise<Uint8Array>;
}
export interface AdmittedUnivariateCrsChunks {
  readonly sourcePackageVersion: string;
  readonly sourceRkyvSha256: {
    readonly tauSequence: string;
    readonly proverKeys: string;
    readonly verifierKeys: string;
    readonly preprocessKeys: string;
  };
  requireSection(label: string): UnivariateCrsChunkSection;
}

interface ChunkDescriptor {
  readonly path: string;
  readonly firstElement: number;
  readonly elementCount: number;
  readonly byteLength: number;
  readonly sha256: string;
}

interface SectionDescriptor {
  readonly label: string;
  readonly encoding: string;
  readonly elementCount: number;
  readonly elementByteLength: number;
  readonly chunks: readonly ChunkDescriptor[];
}
export function admitUnivariateCrsChunks(input: UnivariateCrsChunkInput, role: UnivariateCrsRole, checkDigests = false): AdmittedUnivariateCrsChunks {
  if(typeof input !== "object" || input === null || typeof input.loadChunk !== "function") {
    throw new Error("Univariate CRS input must provide a manifest and loadChunk function.");
  }
  const manifest = requireRecord(input.manifest, "univariate CRS manifest");
  if(manifest.schemaId !== UNIVARIATE_CRS_CHUNK_CONTRACT.schemaId) {
    throw new Error("Univariate CRS chunk manifest uses an unsupported schema.");
  }
  if(manifest.sourceSchemaId !== UNIVARIATE_CRS_CHUNK_CONTRACT.sourceSchemaId) {
    throw new Error("Univariate CRS chunk manifest uses an unsupported source CRS schema.");
  }
  const sourcePackageVersion = requireString(manifest.sourcePackageVersion, "sourcePackageVersion");
  assertCrsChunkCompatibility(sourcePackageVersion);
  const sourceDigests = requireRecord(manifest.sourceRkyvSha256, "sourceRkyvSha256");
  const sourceRkyvSha256 = {
    tauSequence: requireSha256(sourceDigests.tauSequence, "sourceRkyvSha256.tauSequence"),
    proverKeys: requireSha256(sourceDigests.proverKeys, "sourceRkyvSha256.proverKeys"),
    preprocessKeys: requireSha256(sourceDigests.preprocessKeys, "sourceRkyvSha256.preprocessKeys"),
    verifierKeys: requireSha256(sourceDigests.verifierKeys, "sourceRkyvSha256.verifierKeys"),
  };
  const sectionDescriptors = parseSections(manifest.sections);
  assertCompleteSectionSet(sectionDescriptors);
  const cache = new ChunkCache(input.loadChunk, checkDigests);
  const sections = new Map(sectionDescriptors.map((descriptor) => [
    descriptor.label,
    new ChunkSection(descriptor, cache),
  ]));
  for(const label of UNIVARIATE_CRS_CHUNK_CONTRACT.roles[role]) {
    if(!sections.has(label))
      throw new Error(`Univariate CRS is missing ${role} section '${label}'.`);
  }
  return {
    sourcePackageVersion,
    sourceRkyvSha256,
    requireSection(label) {
      const section = sections.get(label);
      if(section === undefined)
        throw new Error(`Univariate CRS section '${label}' is unavailable.`);
      return section;
    },
  };
}

class ChunkSection implements UnivariateCrsChunkSection {
  readonly label: string;
  readonly encoding: string;
  readonly elementCount: number;
  readonly elementByteLength: number;
  readonly #chunks: readonly ChunkDescriptor[];
  readonly #cache: ChunkCache;

  constructor(descriptor: SectionDescriptor, cache: ChunkCache) {
    this.label = descriptor.label;
    this.encoding = descriptor.encoding;
    this.elementCount = descriptor.elementCount;
    this.elementByteLength = descriptor.elementByteLength;
    this.#chunks = descriptor.chunks;
    this.#cache = cache;
  }

  readElement(index: number): Promise<Uint8Array> {
    return this.readElements(index, 1);
  }

  async readElements(firstElement: number, elementCount: number): Promise<Uint8Array> {
    requireRange(firstElement, elementCount, this.elementCount, this.label);
    const output = new Uint8Array(elementCount * this.elementByteLength);
    if (elementCount === 0) return output;
    const endElement = firstElement + elementCount;
    for (const descriptor of this.#chunks) {
      const chunkEnd = descriptor.firstElement + descriptor.elementCount;
      const overlapStart = Math.max(firstElement, descriptor.firstElement);
      const overlapEnd = Math.min(endElement, chunkEnd);
      if (overlapStart >= overlapEnd) continue;
      const bytes = await this.#cache.load(descriptor);
      const sourceOffset = (overlapStart - descriptor.firstElement) * this.elementByteLength;
      const destinationOffset = (overlapStart - firstElement) * this.elementByteLength;
      output.set(
        bytes.subarray(sourceOffset, sourceOffset + (overlapEnd - overlapStart) * this.elementByteLength),
        destinationOffset,
      );
    }
    return output;
  }

  async readStridedElements(firstElement: number, stride: number, elementCount: number): Promise<Uint8Array> {
    if (!Number.isSafeInteger(stride) || stride <= 0) throw new Error("CRS element stride must be a positive safe integer.");
    const lastElement = elementCount === 0 ? firstElement : firstElement + (elementCount - 1) * stride;
    requireRange(firstElement, elementCount === 0 ? 0 : lastElement - firstElement + 1, this.elementCount, this.label);
    const output = new Uint8Array(elementCount * this.elementByteLength);
    for (const descriptor of this.#chunks) {
      const chunkEnd = descriptor.firstElement + descriptor.elementCount;
      const firstOutput = Math.max(0, Math.ceil((descriptor.firstElement - firstElement) / stride));
      const lastOutput = Math.min(elementCount - 1, Math.floor((chunkEnd - 1 - firstElement) / stride));
      if (firstOutput > lastOutput) continue;
      const bytes = await this.#cache.load(descriptor);
      for (let outputIndex = firstOutput; outputIndex <= lastOutput; outputIndex += 1) {
        const element = firstElement + outputIndex * stride;
        const sourceOffset = (element - descriptor.firstElement) * this.elementByteLength;
        output.set(
          bytes.subarray(sourceOffset, sourceOffset + this.elementByteLength),
          outputIndex * this.elementByteLength,
        );
      }
    }
    return output;
  }

}

class ChunkCache {
  readonly #checkDigests: boolean;
  readonly #loadChunk: (relativePath: string) => Promise<Uint8Array>;
  readonly #entries = new Map<string, Promise<Uint8Array>>();

  constructor(loadChunk: (relativePath: string) => Promise<Uint8Array>, checkDigests: boolean) {
    this.#loadChunk = loadChunk;
    this.#checkDigests = checkDigests;
  }

  load(descriptor: ChunkDescriptor): Promise<Uint8Array> {
    const cacheKey = `${descriptor.path}:${descriptor.byteLength}:${descriptor.sha256}`;
    let pending = this.#entries.get(cacheKey);
    if (pending === undefined) {
      pending = this.#loadChunk(descriptor.path).then((bytes) => {
        if (!(bytes instanceof Uint8Array) || bytes.byteLength !== descriptor.byteLength) {
          throw new Error(`CRS chunk '${descriptor.path}' has an invalid byte length.`);
        }
        if (this.#checkDigests && hex(sha256(bytes)) !== descriptor.sha256) {
          throw new Error(`CRS chunk '${descriptor.path}' digest mismatch.`);
        }
        return bytes;
      }).catch((error: unknown) => {
        this.#entries.delete(cacheKey);
        throw error;
      });
      this.#entries.set(cacheKey, pending);
      while (this.#entries.size > 2) {
        const oldest = this.#entries.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        this.#entries.delete(oldest);
      }
    } else {
      this.#entries.delete(cacheKey);
      this.#entries.set(cacheKey, pending);
    }
    return pending;
  }
}

function parseSections(raw: unknown): readonly SectionDescriptor[] {
  if (!Array.isArray(raw)) throw new Error("Univariate CRS sections must be an array.");
  const seen = new Set<string>();
  return raw.map((entry, index) => {
    const value = requireRecord(entry, `sections[${index}]`);
    const label = requireString(value.label, `sections[${index}].label`);
    if (seen.has(label)) throw new Error(`Univariate CRS duplicates section '${label}'.`);
    seen.add(label);
    const contract = UNIVARIATE_CRS_CHUNK_CONTRACT.sections.find((candidate) => candidate.label === label);
    if (contract === undefined) throw new Error(`Univariate CRS contains unsupported section '${label}'.`);
    const encoding = requireString(value.encoding, `${label}.encoding`);
    const elementByteLength = requireSafeInteger(value.elementByteLength, `${label}.elementByteLength`);
    const elementCount = requireSafeInteger(value.elementCount, `${label}.elementCount`);
    if (encoding !== contract.encoding || elementByteLength !== contract.elementByteLength) {
      throw new Error(`Univariate CRS section '${label}' does not match the backend contract.`);
    }
    if ("elementCount" in contract && elementCount !== contract.elementCount) {
      throw new Error(`Univariate CRS section '${label}' has an invalid cardinality.`);
    }
    const chunks = parseChunks(value.chunks, label, elementCount, elementByteLength);
    return { label, encoding, elementCount, elementByteLength, chunks };
  });
}

function parseChunks(raw: unknown, label: string, totalElements: number, elementBytes: number): readonly ChunkDescriptor[] {
  if (!Array.isArray(raw)) throw new Error(`Univariate CRS section '${label}' chunks must be an array.`);
  let cursor = 0;
  const chunks = raw.map((entry, index) => {
    const value = requireRecord(entry, `${label}.chunks[${index}]`);
    const chunk = {
      path: requireSafeRelativePath(value.path, `${label}.chunks[${index}].path`),
      firstElement: requireSafeInteger(value.firstElement, `${label}.chunks[${index}].firstElement`),
      elementCount: requireSafeInteger(value.elementCount, `${label}.chunks[${index}].elementCount`),
      byteLength: requireSafeInteger(value.byteLength, `${label}.chunks[${index}].byteLength`),
      sha256: requireSha256(value.sha256, `${label}.chunks[${index}].sha256`),
    };
    if (chunk.elementCount === 0 || chunk.firstElement !== cursor || chunk.byteLength !== chunk.elementCount * elementBytes) {
      throw new Error(`Univariate CRS section '${label}' has a non-contiguous or malformed chunk table.`);
    }
    cursor += chunk.elementCount;
    return chunk;
  });
  if (cursor !== totalElements || (totalElements === 0 && chunks.length !== 0)) {
    throw new Error(`Univariate CRS section '${label}' chunk table does not cover the declared elements.`);
  }
  return chunks;
}

function assertCompleteSectionSet(sections: readonly SectionDescriptor[]): void {
  if (sections.length !== UNIVARIATE_CRS_CHUNK_CONTRACT.sections.length) {
    throw new Error("Univariate CRS manifest does not contain the complete backend section set.");
  }
}

function requireRange(first: number, count: number, total: number, label: string): void {
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(count) || first < 0 || count < 0 || first + count > total) {
    throw new Error(`Requested range is outside CRS section '${label}'.`);
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function requireSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function requireSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function requireSafeRelativePath(value: unknown, label: string): string {
  const relative = requireString(value, label);
  if (relative.startsWith("/") || relative.startsWith("\\") || relative.split(/[\\/]/u).some((part) => part === ".." || part === "")) {
    throw new Error(`${label} must be a normalized relative path.`);
  }
  return relative;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}
