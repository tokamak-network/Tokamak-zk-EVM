import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getCurveFromName } from "ffjavascript";
import { convertCanonicalCrsChunks } from "../../../scripts/converter/convert-univariate-crs.js";
import { UNIVARIATE_CRS_CHUNK_CONTRACT as contract } from "../../../src/generated/univariate-crs-chunk-contract.generated.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../../src/version.js";

// Offline conversion is tested independently of the runtime readers.
const root = await mkdtemp(path.join(os.tmpdir(), "tokamak-crs-offline-"));
const canonical = path.join(root, "canonical");
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
interface ComparisonCurve {
  F1: { batchFromMontgomery(bytes: Uint8Array): Promise<Uint8Array> };
  terminate(): Promise<void>;
}
let curve: ComparisonCurve | undefined;
try {
  await mkdir(path.join(canonical, "chunks"), { recursive: true });
  const sections = [];
  const source = new Map<string, Uint8Array>();
  for (const spec of contract.sections) {
    const count = "elementCount" in spec ? spec.elementCount : spec.label === "crs.nonpublic-queries" ? 6001 : spec.label === "crs.fixed-public-queries" ? 0 : 3;
    const bytes = new Uint8Array(count * spec.elementByteLength);
    // Nonzero canonical coordinates distinguish conversion from a byte copy.
    for (let i = 0; i < bytes.length; i += 48) bytes[i] = (i / 48) % 31 + 1;
    source.set(spec.label, bytes);
    const relative = `chunks/${spec.label}.bin`;
    if (count > 0) await writeFile(path.join(canonical, relative), bytes);
    sections.push({
      label: String(spec.label),
      encoding: spec.elementByteLength === 96 ? "canonical-g1-affine-le" : "canonical-g2-affine-le",
      elementCount: count, elementByteLength: spec.elementByteLength,
      chunks: count === 0 ? [] : [{ path: relative, firstElement: 0, elementCount: count, byteLength: bytes.length, sha256: hash(bytes) }],
    });
  }
  const manifest = {
    schemaId: contract.sourceSchemaId, sourcePackageVersion: BACKEND_WASM_PACKAGE_VERSION,
    sourceRkyvSha256: { tauSequence: "11".repeat(32), proverKeys: "22".repeat(32), preprocessKeys: "33".repeat(32), verifierKeys: "44".repeat(32) },
    sections,
  };
  const save = () => writeFile(path.join(canonical, "canonical-manifest.json"), JSON.stringify(manifest));
  await save();

  const first = manifest.sections[0]!;
  const label = first.label;
  first.label = "unsupported";
  await save();
  await assert.rejects(convertCanonicalCrsChunks(canonical, path.join(root, "invalid-section")), /unsupported section/);
  first.label = label;
  const digest = first.chunks[0]!.sha256;
  first.chunks[0]!.sha256 = "00".repeat(32);
  await save();
  await assert.rejects(convertCanonicalCrsChunks(canonical, path.join(root, "invalid-digest")), /digest mismatch/);
  first.chunks[0]!.sha256 = digest;
  await save();

  const output = path.join(root, "runtime");
  await convertCanonicalCrsChunks(canonical, output);
  // The converter owns and terminates its temporary ffjavascript runtime.
  // Acquire our independent comparison runtime only after it has finished.
  curve = await getCurveFromName("bls12381") as ComparisonCurve;
  const result = JSON.parse(await readFile(path.join(output, contract.manifestFileName), "utf8"));
  assert.deepEqual(result.sourceRkyvSha256, manifest.sourceRkyvSha256);
  assert.equal(result.schemaId, contract.schemaId);
  assert.equal(result.sections.length, contract.sections.length);
  assert.equal("declaredCapacity" in result, false);
  assert.equal("k" in result, false);
  for (const spec of contract.sections) {
    const section = result.sections.find((s: { label: string }) => s.label === spec.label);
    assert.equal(section.encoding, spec.encoding);
    assert.equal(section.elementCount * spec.elementByteLength, source.get(spec.label)!.length);
    if (section.elementCount === 0) { assert.deepEqual(section.chunks, []); continue; }
    const parts: Uint8Array[] = [];
    let first = 0;
    for (const chunk of section.chunks) {
      const bytes = new Uint8Array(await readFile(path.join(output, chunk.path)));
      assert.equal(hash(bytes), chunk.sha256);
      assert.equal(chunk.firstElement, first);
      first += chunk.elementCount;
      if (spec.label === "crs.nonpublic-queries") assert(bytes.length <= 256 * 1024);
      parts.push(bytes);
    }
    const bytes = new Uint8Array(Buffer.concat(parts));
    assert.deepEqual(await curve.F1.batchFromMontgomery(bytes), source.get(spec.label));
  }
  console.log("Offline CRS: all current sections, four source identities, empty ranges, canonical roundtrip and malformed-input rejection passed");
} finally {
  if (curve !== undefined) await curve.terminate();
  await rm(root, { recursive: true, force: true });
}
