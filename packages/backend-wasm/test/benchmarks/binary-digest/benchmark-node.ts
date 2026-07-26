import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import {
  decodeBinaryArtifactFile,
} from "../../../src/artifacts/binary/binary-artifact-file.js";
import {
  BINARY_DIGEST_ENTRY_BYTES,
  BinaryDigestEntryType,
} from "../../../src/artifacts/binary/binary-format.js";
import {
  bytesWithSelfDigestsZeroed,
  sha256,
} from "../../../src/artifacts/binary/binary-table-utils.js";
import {
  createSelfDigestSegments,
  sha256Incremental,
  sha256WithSegmentedSelfDigests,
} from "./digest-candidates.js";

const DEFAULT_ARTIFACT_PATH = "fixtures/small/runtime/prover-crs.bin";

interface MemorySample {
  readonly rss: number;
  readonly heapUsed: number;
  readonly external: number;
  readonly arrayBuffers: number;
}

interface Measurement {
  readonly elapsedMs: number;
  readonly peakDeltaBytes: MemorySample;
}

async function main(): Promise<void> {
  checkSyntheticParity();

  const artifactPath = process.argv[2] ?? DEFAULT_ARTIFACT_PATH;
  const artifact = new Uint8Array(await readFile(artifactPath));
  const artifactFile = await decodeBinaryArtifactFile(artifact);
  const digestTableOffset = readU32(artifact, 32);
  const digestEntryCount = readU16(artifact, 54);
  const largestSection = [...artifactFile.sections].sort(
    (left, right) => right.byteLength - left.byteLength,
  )[0];

  if (largestSection === undefined) {
    throw new Error("Digest benchmark artifact has no sections.");
  }

  const baselineSelfDigest = await sha256(
    bytesWithSelfDigestsZeroed(artifact, digestTableOffset, digestEntryCount),
  );
  const candidateSelfDigest = sha256WithSegmentedSelfDigests(
    artifact,
    digestTableOffset,
    digestEntryCount,
  );
  assertBytesEqual(candidateSelfDigest, baselineSelfDigest, "real artifact self digest");

  const baselineSectionDigest = await sha256(largestSection.data);
  const candidateSectionDigest = sha256Incremental([largestSection.data]);
  assertBytesEqual(candidateSectionDigest, baselineSectionDigest, "real artifact section digest");

  const baselineSelf = await measureBaselineSelfDigest(
    artifact,
    digestTableOffset,
    digestEntryCount,
  );
  const candidateSelf = await measureIncremental(
    createSelfDigestSegments(artifact, digestTableOffset, digestEntryCount),
  );
  const baselineSection = await measureBaselineSectionDigest(largestSection.data);
  const candidateSection = await measureIncremental([largestSection.data]);

  console.log(JSON.stringify({
    runtime: "node",
    artifactPath,
    artifactBytes: artifact.byteLength,
    largestSection: {
      label: largestSection.label,
      bytes: largestSection.byteLength,
    },
    selfDigest: {
      baseline: baselineSelf,
      candidate: candidateSelf,
    },
    sectionDigest: {
      baseline: baselineSection,
      candidate: candidateSection,
    },
  }, null, 2));
}

function checkSyntheticParity(): void {
  const digestTableOffset = 64;
  const digestEntryCount = 3;
  const bytes = new Uint8Array(digestTableOffset + digestEntryCount * BINARY_DIGEST_ENTRY_BYTES + 97);
  for (let index = 0; index < bytes.byteLength; index += 1) {
    bytes[index] = (index * 131 + 17) & 0xff;
  }

  const view = new DataView(bytes.buffer);
  view.setUint16(digestTableOffset, BinaryDigestEntryType.SelfDigest, true);
  view.setUint16(
    digestTableOffset + BINARY_DIGEST_ENTRY_BYTES,
    BinaryDigestEntryType.SectionDigest,
    true,
  );
  view.setUint16(
    digestTableOffset + 2 * BINARY_DIGEST_ENTRY_BYTES,
    BinaryDigestEntryType.SelfDigest,
    true,
  );

  const wrapper = new Uint8Array(bytes.byteLength + 23);
  wrapper.set(bytes, 11);
  const subarray = wrapper.subarray(11, 11 + bytes.byteLength);
  const baseline = sha256Incremental([
    bytesWithSelfDigestsZeroed(subarray, digestTableOffset, digestEntryCount),
  ]);
  const candidate = sha256WithSegmentedSelfDigests(
    subarray,
    digestTableOffset,
    digestEntryCount,
  );
  assertBytesEqual(candidate, baseline, "subarray-backed multiple self digests");

  for (const malformed of [
    { input: new Uint8Array(32), offset: 24, count: 1 },
    { input: new Uint8Array(64), offset: -1, count: 1 },
    { input: new Uint8Array(64), offset: 0, count: 2 },
  ]) {
    assertSameOutcome(
      () => sha256Incremental([
        bytesWithSelfDigestsZeroed(malformed.input, malformed.offset, malformed.count),
      ]),
      () => sha256WithSegmentedSelfDigests(
        malformed.input,
        malformed.offset,
        malformed.count,
      ),
      "malformed digest table",
    );
  }
}

async function measureBaselineSelfDigest(
  input: Uint8Array,
  digestTableOffset: number,
  digestEntryCount: number,
): Promise<Measurement> {
  collectGarbage();
  const baseline = sampleMemory();
  const samples = [baseline];
  const startedAt = performance.now();
  let zeroed: Uint8Array | undefined = bytesWithSelfDigestsZeroed(
    input,
    digestTableOffset,
    digestEntryCount,
  );
  samples.push(sampleMemory());
  let digestInput: ArrayBuffer | undefined = zeroed.slice().buffer as ArrayBuffer;
  samples.push(sampleMemory());
  const digestPromise = globalThis.crypto.subtle.digest("SHA-256", digestInput);
  const stopSampling = sampleUntilSettled(samples);
  await digestPromise;
  stopSampling();
  samples.push(sampleMemory());
  const elapsedMs = performance.now() - startedAt;
  zeroed = undefined;
  digestInput = undefined;

  return { elapsedMs, peakDeltaBytes: peakDelta(baseline, samples) };
}

async function measureBaselineSectionDigest(input: Uint8Array): Promise<Measurement> {
  collectGarbage();
  const baseline = sampleMemory();
  const samples = [baseline];
  const startedAt = performance.now();
  let digestInput: ArrayBuffer | undefined = input.slice().buffer as ArrayBuffer;
  samples.push(sampleMemory());
  const digestPromise = globalThis.crypto.subtle.digest("SHA-256", digestInput);
  const stopSampling = sampleUntilSettled(samples);
  await digestPromise;
  stopSampling();
  samples.push(sampleMemory());
  const elapsedMs = performance.now() - startedAt;
  digestInput = undefined;

  return { elapsedMs, peakDeltaBytes: peakDelta(baseline, samples) };
}

async function measureIncremental(chunks: readonly Uint8Array[]): Promise<Measurement> {
  collectGarbage();
  const baseline = sampleMemory();
  const samples = [baseline];
  const startedAt = performance.now();
  const hash = (await import("@noble/hashes/sha2")).sha256.create();
  for (const chunk of chunks) {
    hash.update(chunk);
    samples.push(sampleMemory());
  }
  hash.digest();
  samples.push(sampleMemory());

  return {
    elapsedMs: performance.now() - startedAt,
    peakDeltaBytes: peakDelta(baseline, samples),
  };
}

function sampleUntilSettled(samples: MemorySample[]): () => void {
  const timer = setInterval(() => samples.push(sampleMemory()), 2);
  return () => clearInterval(timer);
}

function sampleMemory(): MemorySample {
  const memory = process.memoryUsage();
  return {
    rss: memory.rss,
    heapUsed: memory.heapUsed,
    external: memory.external,
    arrayBuffers: memory.arrayBuffers,
  };
}

function peakDelta(baseline: MemorySample, samples: readonly MemorySample[]): MemorySample {
  return {
    rss: Math.max(...samples.map((sample) => sample.rss)) - baseline.rss,
    heapUsed: Math.max(...samples.map((sample) => sample.heapUsed)) - baseline.heapUsed,
    external: Math.max(...samples.map((sample) => sample.external)) - baseline.external,
    arrayBuffers: Math.max(...samples.map((sample) => sample.arrayBuffers)) - baseline.arrayBuffers,
  };
}

function collectGarbage(): void {
  (globalThis as typeof globalThis & { gc?: () => void }).gc?.();
}

function readU16(input: Uint8Array, offset: number): number {
  return new DataView(input.buffer, input.byteOffset, input.byteLength).getUint16(offset, true);
}

function readU32(input: Uint8Array, offset: number): number {
  return new DataView(input.buffer, input.byteOffset, input.byteLength).getUint32(offset, true);
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (
    actual.byteLength !== expected.byteLength
    || actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(`${label} mismatch.`);
  }
}

function assertSameOutcome(
  baseline: () => Uint8Array,
  candidate: () => Uint8Array,
  label: string,
): void {
  let baselineResult: Uint8Array | undefined;
  let candidateResult: Uint8Array | undefined;
  let baselineThrew = false;
  let candidateThrew = false;

  try {
    baselineResult = baseline();
  } catch {
    baselineThrew = true;
  }
  try {
    candidateResult = candidate();
  } catch {
    candidateThrew = true;
  }

  if (baselineThrew !== candidateThrew) {
    throw new Error(`${label} throw behavior mismatch.`);
  }
  if (baselineResult !== undefined && candidateResult !== undefined) {
    assertBytesEqual(candidateResult, baselineResult, label);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
