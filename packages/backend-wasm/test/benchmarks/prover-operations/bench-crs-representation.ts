import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BinarySectionEncoding,
  BinarySectionType,
  loadRuntimeArtifactFile,
  requireRuntimeSection,
} from "../../../src/index.js";
import { loadProverCrsArtifact } from "../../../src/artifacts/loaders/prepared-data.js";
import type { RuntimeArtifactFile } from "../../../src/artifacts/loaders/types.js";
import {
  parseProverCrs,
  type ProverCrsRuntime,
} from "../../../src/prover/api/binary-input.js";

const DYNAMIC_LABELS = [
  "sigma1.xy-powers",
  "sigma1.gamma-inv-o-inst",
  "sigma1.eta-inv-li-o-inter-alpha4-kj",
  "sigma1.delta-inv-li-o-prv",
  "sigma1.delta-inv-alphak-xh-tx",
  "sigma1.delta-inv-alpha4-xj-tx",
  "sigma1.delta-inv-alphak-yi-ty",
] as const;

type DynamicLabel = (typeof DYNAMIC_LABELS)[number];

interface SectionDescriptor {
  readonly data: Uint8Array;
  readonly count: number;
  readonly elementByteLength: number;
}

interface DescriptorCrs {
  readonly fixedPoints: Readonly<Record<string, Uint8Array>>;
  readonly sections: Readonly<Record<DynamicLabel, SectionDescriptor>>;
}

interface LegacyCrs {
  readonly sections: Readonly<Record<DynamicLabel, readonly Uint8Array[]>>;
}

interface MemorySnapshot {
  readonly rss: number;
  readonly heapUsed: number;
  readonly external: number;
  readonly arrayBuffers: number;
}

interface RepresentationResult {
  readonly candidate: string;
  readonly constructionMs: number;
  readonly accessMs: number;
  readonly rangeCopyMs: number;
  readonly retainedObjects: number;
  readonly memoryBefore: MemorySnapshot;
  readonly memoryAfter: MemorySnapshot;
  readonly memoryDelta: MemorySnapshot;
  readonly checksum: number;
}

async function main(): Promise<void> {
  requireGc();
  const crsPath = path.resolve("fixtures/small/runtime/prover-crs-prepared-data/crs.bin");
  const rawBytes = await readFile(crsPath);
  const artifact = await loadRuntimeArtifactFile(rawBytes);
  const expectedDigests = sectionDigests(artifact);

  forceGc();
  const production = await measureProduction(artifact);
  forceGc();
  const legacy = await measureLegacy(artifact);

  const currentCrs = parseProverCrs(artifact);
  const descriptorCrs = buildDescriptorCrs(artifact);
  assertRepresentationParity(currentCrs, descriptorCrs);
  assertDigestParity(expectedDigests, sectionDigests(artifact));

  const report = {
    generatedAt: new Date().toISOString(),
    artifact: path.relative(process.cwd(), crsPath),
    artifactBytes: rawBytes.byteLength,
    sectionCounts: Object.fromEntries(
      DYNAMIC_LABELS.map((label) => [label, descriptorCrs.sections[label].count]),
    ),
    parity: "pass",
    results: [legacy, production],
  };
  console.table(report.results.map((result) => ({
    candidate: result.candidate,
    "construct ms": result.constructionMs.toFixed(3),
    "access ms": result.accessMs.toFixed(3),
    "range copy ms": result.rangeCopyMs.toFixed(3),
    objects: result.retainedObjects,
    "heap delta MiB": (result.memoryDelta.heapUsed / 2 ** 20).toFixed(3),
    "RSS delta MiB": (result.memoryDelta.rss / 2 ** 20).toFixed(3),
  })));

  const outputPath = path.resolve("tmp/timing/crs-representation.json");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
}

async function measureLegacy(artifact: RuntimeArtifactFile): Promise<RepresentationResult> {
  forceGc();
  const before = memorySnapshot();
  const start = performance.now();
  let value: LegacyCrs | undefined = buildLegacyCrs(artifact);
  const constructionMs = performance.now() - start;
  const after = memorySnapshot();
  const access = measureLegacyAccess(value);
  const range = measureLegacyRangeCopy(value);
  const retainedObjects = DYNAMIC_LABELS.reduce((sum, label) => sum + value!.sections[label].length, 0);
  value = undefined;
  forceGc();

  return {
    candidate: "legacy-per-point-views",
    constructionMs,
    accessMs: access.ms,
    rangeCopyMs: range.ms,
    retainedObjects,
    memoryBefore: before,
    memoryAfter: after,
    memoryDelta: subtractMemory(after, before),
    checksum: access.checksum ^ range.checksum,
  };
}

async function measureProduction(artifact: RuntimeArtifactFile): Promise<RepresentationResult> {
  forceGc();
  const before = memorySnapshot();
  const start = performance.now();
  let value: ProverCrsRuntime | undefined = parseProverCrs(artifact);
  const constructionMs = performance.now() - start;
  const after = memorySnapshot();
  const access = measureProductionAccess(value);
  const range = measureProductionRangeCopy(value);
  const retainedObjects = DYNAMIC_LABELS.length;
  value = undefined;
  forceGc();

  return {
    candidate: "production-raw-section-descriptors",
    constructionMs,
    accessMs: access.ms,
    rangeCopyMs: range.ms,
    retainedObjects,
    memoryBefore: before,
    memoryAfter: after,
    memoryDelta: subtractMemory(after, before),
    checksum: access.checksum ^ range.checksum,
  };
}

function buildLegacyCrs(artifact: RuntimeArtifactFile): LegacyCrs {
  return {
    sections: Object.fromEntries(
      DYNAMIC_LABELS.map((label) => {
        const section = requireG1Section(artifact, label);
        return [
          label,
          Array.from({ length: section.data.byteLength / section.elementByteLength }, (_, index) => {
            const offset = index * section.elementByteLength;
            return section.data.subarray(offset, offset + section.elementByteLength);
          }),
        ];
      }),
    ) as unknown as Record<DynamicLabel, readonly Uint8Array[]>,
  };
}

function buildDescriptorCrs(artifact: RuntimeArtifactFile): DescriptorCrs {
  const sections = Object.fromEntries(
    DYNAMIC_LABELS.map((label) => {
      const section = requireG1Section(artifact, label);
      if (section.data.byteLength % section.elementByteLength !== 0) {
        throw new Error(`${label} section length is not divisible by point width.`);
      }
      return [
        label,
        {
          data: section.data,
          count: section.data.byteLength / section.elementByteLength,
          elementByteLength: section.elementByteLength,
        },
      ];
    }),
  ) as Record<DynamicLabel, SectionDescriptor>;

  return {
    fixedPoints: loadProverCrsArtifact(artifact).pointsByName,
    sections,
  };
}

function assertRepresentationParity(current: ProverCrsRuntime, candidate: DescriptorCrs): void {
  const currentSections: Record<DynamicLabel, SectionDescriptor> = {
    "sigma1.xy-powers": current.sigma1.xyPowers,
    "sigma1.gamma-inv-o-inst": current.sigma1.gammaInvOInst,
    "sigma1.eta-inv-li-o-inter-alpha4-kj": current.sigma1.etaInvLiOInterAlpha4Kj,
    "sigma1.delta-inv-li-o-prv": current.sigma1.deltaInvLiOPrv,
    "sigma1.delta-inv-alphak-xh-tx": current.sigma1.deltaInvAlphakXhTx,
    "sigma1.delta-inv-alpha4-xj-tx": current.sigma1.deltaInvAlpha4XjTx,
    "sigma1.delta-inv-alphak-yi-ty": current.sigma1.deltaInvAlphakYiTy,
  };
  for (const label of DYNAMIC_LABELS) {
    const production = currentSections[label];
    const descriptor = candidate.sections[label];
    if (production.count !== descriptor.count) {
      throw new Error(`${label} count mismatch.`);
    }
    for (const index of sampleIndexes(descriptor.count)) {
      assertBytesEqual(pointAt(production, index), pointAt(descriptor, index), `${label}[${index}]`);
    }
    const currentDigest = createHash("sha256").update(production.data).digest("hex");
    const descriptorDigest = createHash("sha256").update(descriptor.data).digest("hex");
    if (currentDigest !== descriptorDigest) {
      throw new Error(`${label} complete digest mismatch.`);
    }
  }
}

function measureLegacyAccess(crs: LegacyCrs): { readonly ms: number; readonly checksum: number } {
  let checksum = 0;
  const start = performance.now();
  for (let iteration = 0; iteration < 100_000; iteration += 1) {
    const section = crs.sections[DYNAMIC_LABELS[iteration % DYNAMIC_LABELS.length]];
    const point = section[(iteration * 2654435761) % section.length];
    checksum ^= point[iteration % point.byteLength];
  }
  return { ms: performance.now() - start, checksum };
}

function measureProductionAccess(crs: ProverCrsRuntime): { readonly ms: number; readonly checksum: number } {
  const sections: readonly SectionDescriptor[] = [
    crs.sigma1.xyPowers,
    crs.sigma1.gammaInvOInst,
    crs.sigma1.etaInvLiOInterAlpha4Kj,
    crs.sigma1.deltaInvLiOPrv,
    crs.sigma1.deltaInvAlphakXhTx,
    crs.sigma1.deltaInvAlpha4XjTx,
    crs.sigma1.deltaInvAlphakYiTy,
  ];
  let checksum = 0;
  const start = performance.now();
  for (let iteration = 0; iteration < 100_000; iteration += 1) {
    const descriptor = sections[iteration % sections.length];
    const point = pointAt(descriptor, (iteration * 2654435761) % descriptor.count);
    checksum ^= point[iteration % point.byteLength];
  }
  return { ms: performance.now() - start, checksum };
}

function measureLegacyRangeCopy(crs: LegacyCrs): { readonly ms: number; readonly checksum: number } {
  const points = crs.sections["sigma1.xy-powers"];
  const width = points[0].byteLength;
  const rangePoints = 262_144;
  const output = new Uint8Array(rangePoints * width);
  const start = performance.now();
  for (let index = 0; index < rangePoints; index += 1) {
    output.set(points[index], index * width);
  }
  return { ms: performance.now() - start, checksum: output[output.byteLength - 1] };
}

function measureProductionRangeCopy(crs: ProverCrsRuntime): { readonly ms: number; readonly checksum: number } {
  const descriptor = crs.sigma1.xyPowers;
  const byteLength = 262_144 * descriptor.elementByteLength;
  const start = performance.now();
  const output = descriptor.data.slice(0, byteLength);
  return { ms: performance.now() - start, checksum: output[output.byteLength - 1] };
}

function pointAt(descriptor: SectionDescriptor, index: number): Uint8Array {
  if (!Number.isSafeInteger(index) || index < 0 || index >= descriptor.count) {
    throw new Error(`Point index ${index} is out of range.`);
  }
  const offset = index * descriptor.elementByteLength;
  return descriptor.data.subarray(offset, offset + descriptor.elementByteLength);
}

function sampleIndexes(count: number): readonly number[] {
  const indexes = new Set<number>([0, Math.floor(count / 2), count - 1]);
  let state = 0x12345678;
  for (let iteration = 0; iteration < 32; iteration += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    indexes.add(state % count);
  }
  return [...indexes];
}

function sectionDigests(artifact: RuntimeArtifactFile): Readonly<Record<DynamicLabel, string>> {
  return Object.fromEntries(
    DYNAMIC_LABELS.map((label) => [
      label,
      createHash("sha256").update(requireG1Section(artifact, label).data).digest("hex"),
    ]),
  ) as Record<DynamicLabel, string>;
}

function assertDigestParity(
  expected: Readonly<Record<DynamicLabel, string>>,
  actual: Readonly<Record<DynamicLabel, string>>,
): void {
  for (const label of DYNAMIC_LABELS) {
    if (expected[label] !== actual[label]) {
      throw new Error(`${label} digest changed during representation measurements.`);
    }
  }
}

function requireG1Section(artifact: RuntimeArtifactFile, label: string) {
  return requireRuntimeSection(artifact, {
    type: BinarySectionType.CrsG1,
    encoding: BinarySectionEncoding.FfjsG1Affine96,
    label,
  });
}

function memorySnapshot(): MemorySnapshot {
  const usage = process.memoryUsage();
  return {
    rss: usage.rss,
    heapUsed: usage.heapUsed,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers,
  };
}

function subtractMemory(after: MemorySnapshot, before: MemorySnapshot): MemorySnapshot {
  return {
    rss: after.rss - before.rss,
    heapUsed: after.heapUsed - before.heapUsed,
    external: after.external - before.external,
    arrayBuffers: after.arrayBuffers - before.arrayBuffers,
  };
}

function assertBytesEqual(left: Uint8Array, right: Uint8Array, label: string): void {
  if (left.byteLength !== right.byteLength) {
    throw new Error(`${label} byte length mismatch.`);
  }
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      throw new Error(`${label} mismatch at byte ${index}.`);
    }
  }
}

function forceGc(): void {
  globalThis.gc?.();
  globalThis.gc?.();
}

function requireGc(): void {
  if (globalThis.gc === undefined) {
    throw new Error("Run this benchmark through the package script with --expose-gc.");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
