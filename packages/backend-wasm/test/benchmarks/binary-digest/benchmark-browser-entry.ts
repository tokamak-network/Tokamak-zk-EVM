import {
  decodeBinaryArtifactFile,
} from "../../../src/artifacts/binary/binary-artifact-file.js";
import {
  bytesWithSelfDigestsZeroed,
  sha256,
} from "../../../src/artifacts/binary/binary-table-utils.js";
import {
  createSelfDigestSegments,
  sha256Incremental,
  sha256WithSegmentedSelfDigests,
} from "./digest-candidates.js";

interface BrowserDigestMeasurement {
  readonly elapsedMs: number;
  readonly peakMemoryDeltaBytes: number;
  readonly memorySource: string;
}

interface BrowserDigestBenchmarkResult {
  readonly status: "pending" | "ok" | "error";
  readonly artifactBytes?: number;
  readonly largestSection?: { readonly label: string; readonly bytes: number };
  readonly selfDigest?: {
    readonly baseline: BrowserDigestMeasurement;
    readonly candidate: BrowserDigestMeasurement;
  };
  readonly sectionDigest?: {
    readonly baseline: BrowserDigestMeasurement;
    readonly candidate: BrowserDigestMeasurement;
  };
  readonly error?: string;
}

declare global {
  interface Window {
    __binaryDigestBenchmark?: BrowserDigestBenchmarkResult;
  }
}

window.__binaryDigestBenchmark = { status: "pending" };

run().then(
  (result) => {
    window.__binaryDigestBenchmark = { status: "ok", ...result };
  },
  (error: unknown) => {
    window.__binaryDigestBenchmark = {
      status: "error",
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    };
  },
);

async function run(): Promise<Omit<BrowserDigestBenchmarkResult, "status">> {
  const artifact = new Uint8Array(await (await fetch("/artifact.bin")).arrayBuffer());
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
  assertBytesEqual(candidateSelfDigest, baselineSelfDigest, "browser self digest");

  const baselineSectionDigest = await sha256(largestSection.data);
  const candidateSectionDigest = sha256Incremental([largestSection.data]);
  assertBytesEqual(candidateSectionDigest, baselineSectionDigest, "browser section digest");

  const baselineSelfElapsed = await measureElapsed(() =>
    sha256(bytesWithSelfDigestsZeroed(artifact, digestTableOffset, digestEntryCount))
  );
  const candidateSelfElapsed = await measureElapsed(() =>
    sha256WithSegmentedSelfDigests(artifact, digestTableOffset, digestEntryCount)
  );
  const baselineSectionElapsed = await measureElapsed(() => sha256(largestSection.data));
  const candidateSectionElapsed = await measureElapsed(() =>
    sha256Incremental([largestSection.data])
  );

  const baselineSelfMemory = await measureBaselineSelfMemory(
    artifact,
    digestTableOffset,
    digestEntryCount,
  );
  const candidateSelfMemory = await measureIncrementalMemory(
    createSelfDigestSegments(artifact, digestTableOffset, digestEntryCount),
  );
  const baselineSectionMemory = await measureBaselineSectionMemory(largestSection.data);
  const candidateSectionMemory = await measureIncrementalMemory([largestSection.data]);

  return {
    artifactBytes: artifact.byteLength,
    largestSection: {
      label: largestSection.label,
      bytes: largestSection.byteLength,
    },
    selfDigest: {
      baseline: {
        elapsedMs: baselineSelfElapsed,
        ...baselineSelfMemory,
      },
      candidate: {
        elapsedMs: candidateSelfElapsed,
        ...candidateSelfMemory,
      },
    },
    sectionDigest: {
      baseline: {
        elapsedMs: baselineSectionElapsed,
        ...baselineSectionMemory,
      },
      candidate: {
        elapsedMs: candidateSectionElapsed,
        ...candidateSectionMemory,
      },
    },
  };
}

async function measureBaselineSelfMemory(
  input: Uint8Array,
  digestTableOffset: number,
  digestEntryCount: number,
): Promise<{ readonly peakMemoryDeltaBytes: number; readonly memorySource: string }> {
  collectGarbage();
  const baseline = await sampleMemory();
  let zeroed: Uint8Array | undefined = bytesWithSelfDigestsZeroed(
    input,
    digestTableOffset,
    digestEntryCount,
  );
  const afterZeroed = await sampleMemory();
  let digestInput: ArrayBuffer | undefined = zeroed.slice().buffer as ArrayBuffer;
  const afterDigestCopy = await sampleMemory();
  await globalThis.crypto.subtle.digest("SHA-256", digestInput);
  const afterDigest = await sampleMemory();
  zeroed = undefined;
  digestInput = undefined;

  return summarizeMemory(baseline, [afterZeroed, afterDigestCopy, afterDigest]);
}

async function measureBaselineSectionMemory(
  input: Uint8Array,
): Promise<{ readonly peakMemoryDeltaBytes: number; readonly memorySource: string }> {
  collectGarbage();
  const baseline = await sampleMemory();
  let digestInput: ArrayBuffer | undefined = input.slice().buffer as ArrayBuffer;
  const afterDigestCopy = await sampleMemory();
  await globalThis.crypto.subtle.digest("SHA-256", digestInput);
  const afterDigest = await sampleMemory();
  digestInput = undefined;

  return summarizeMemory(baseline, [afterDigestCopy, afterDigest]);
}

async function measureIncrementalMemory(
  chunks: readonly Uint8Array[],
): Promise<{ readonly peakMemoryDeltaBytes: number; readonly memorySource: string }> {
  collectGarbage();
  const baseline = await sampleMemory();
  const samples: MemoryReading[] = [];
  const hash = (await import("@noble/hashes/sha2")).sha256.create();
  for (const chunk of chunks) {
    hash.update(chunk);
    samples.push(await sampleMemory());
  }
  hash.digest();
  samples.push(await sampleMemory());

  return summarizeMemory(baseline, samples);
}

async function measureElapsed(run: () => Uint8Array | Promise<Uint8Array>): Promise<number> {
  collectGarbage();
  const startedAt = performance.now();
  await run();
  return performance.now() - startedAt;
}

interface MemoryReading {
  readonly bytes: number;
  readonly source: string;
}

async function sampleMemory(): Promise<MemoryReading> {
  const performanceWithMemory = performance as Performance & {
    measureUserAgentSpecificMemory?: () => Promise<{ readonly bytes: number }>;
    memory?: { readonly usedJSHeapSize: number };
  };

  if (performanceWithMemory.measureUserAgentSpecificMemory !== undefined) {
    try {
      const measurement = await performanceWithMemory.measureUserAgentSpecificMemory();
      return { bytes: measurement.bytes, source: "measureUserAgentSpecificMemory" };
    } catch {
      // Headless Chromium may expose the API while denying measurements.
    }
  }

  if (performanceWithMemory.memory !== undefined) {
    return { bytes: performanceWithMemory.memory.usedJSHeapSize, source: "performance.memory.usedJSHeapSize" };
  }

  throw new Error("Chromium does not expose a supported memory measurement API.");
}

function summarizeMemory(
  baseline: MemoryReading,
  samples: readonly MemoryReading[],
): { readonly peakMemoryDeltaBytes: number; readonly memorySource: string } {
  return {
    peakMemoryDeltaBytes: Math.max(0, ...samples.map((sample) => sample.bytes - baseline.bytes)),
    memorySource: baseline.source,
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
