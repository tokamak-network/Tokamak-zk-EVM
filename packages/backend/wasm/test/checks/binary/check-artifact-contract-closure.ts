import { fileURLToPath } from "node:url";

import {
  createBinaryArtifactFile,
} from "../../../src/artifacts/binary/binary-artifact-file.js";
import {
  type BinaryArtifactFileKind,
  type BinarySectionInput,
  expectedElementByteLength,
} from "../../../src/artifacts/binary/binary-format.js";
import { admitRuntimeBinaryArtifact } from "../../../src/artifacts/binary/runtime-admission.js";
import type { RuntimeArtifactFormatSpec } from "../../../src/artifacts/specs/types.js";
import { validateBinary } from "../../../src/converter/index.js";
import { RUNTIME_ARTIFACT_SPECS } from "../../../src/generated/browser-artifact-contracts.generated.js";

async function main(): Promise<void> {
  for (const spec of RUNTIME_ARTIFACT_SPECS) {
    await checkArtifactContract(spec);
  }
  console.log(`Checked structural converter/runtime agreement for ${RUNTIME_ARTIFACT_SPECS.length} artifact contracts`);
}

async function checkArtifactContract(spec: RuntimeArtifactFormatSpec): Promise<void> {
  const validSections = sectionsFor(spec);
  const valid = await createArtifact(spec.kind, validSections);
  admitRuntimeBinaryArtifact(valid, spec.kind, spec);
  await validateBinary(valid);

  const wrongMagic = valid.slice();
  wrongMagic[0] ^= 1;
  await assertRejectedByBoth(wrongMagic, spec, "magic mutation");

  const wrongTable = valid.slice();
  new DataView(wrongTable.buffer, wrongTable.byteOffset, wrongTable.byteLength).setUint32(40, 0, true);
  await assertRejectedByBoth(wrongTable, spec, "section-table mutation");

  const missing = await createArtifact(spec.kind, validSections.slice(1));
  await assertRejectedByBoth(missing, spec, "missing section");

  const duplicate = await createArtifact(spec.kind, [validSections[0], ...validSections]);
  await assertRejectedByBoth(duplicate, spec, "duplicate section");

  const unexpected = await createArtifact(spec.kind, [
    ...validSections,
    { ...validSections[0], label: `${validSections[0].label}.unexpected` },
  ]);
  await assertRejectedByBoth(unexpected, spec, "unexpected section");

  const fixedSectionIndex = spec.sections.findIndex(section => section.elementCount !== null);
  if (fixedSectionIndex >= 0) {
    const wrongCardinality = validSections.map((section, index) => (
      index === fixedSectionIndex
        ? sectionWithCount(section, section.elementCount + 1)
        : section
    ));
    const malformed = await createArtifact(spec.kind, wrongCardinality);
    await assertRejectedByBoth(malformed, spec, "fixed-cardinality mutation");
  }
}

function sectionsFor(spec: RuntimeArtifactFormatSpec): readonly BinarySectionInput[] {
  return spec.sections.map((section) => sectionWithCount({
    type: section.type,
    encoding: section.encoding,
    label: section.label,
    elementCount: section.elementCount ?? 1,
    elementByteLength: section.elementByteLength
      ?? expectedElementByteLength(section.encoding)
      ?? 4,
    data: new Uint8Array(),
  }, section.elementCount ?? 1));
}

function sectionWithCount(section: BinarySectionInput, elementCount: number): BinarySectionInput {
  const elementByteLength = section.elementByteLength;
  return {
    ...section,
    elementCount,
    data: new Uint8Array(elementCount * elementByteLength),
  };
}

async function createArtifact(
  kind: BinaryArtifactFileKind,
  sections: readonly BinarySectionInput[],
): Promise<Uint8Array> {
  return createBinaryArtifactFile({
    kind,
    sourcePackageVersion: "0.0.0",
    sections,
  });
}

async function assertRejectedByBoth(
  bytes: Uint8Array,
  spec: RuntimeArtifactFormatSpec,
  label: string,
): Promise<void> {
  assertThrows(() => admitRuntimeBinaryArtifact(bytes, spec.kind, spec), `${spec.name} runtime ${label}`);
  await assertRejects(() => validateBinary(bytes), `${spec.name} converter ${label}`);
}

function assertThrows(operation: () => unknown, label: string): void {
  try {
    operation();
  } catch {
    return;
  }
  throw new Error(`Expected ${label} to be rejected.`);
}

async function assertRejects(operation: () => Promise<unknown>, label: string): Promise<void> {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error(`Expected ${label} to be rejected.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
