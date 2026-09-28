import { decodeBinaryArtifactFile } from '../../../src/artifacts/binary/binary-artifact-file.js';
import {
  BinaryArtifactFileKind,
  BinarySectionEncoding,
  BinarySectionType,
} from '../../../src/artifacts/binary/binary-format.js';
import { convertSelector } from '../../../src/converter/conversion/selector-converter.js';
import { validateBinary } from '../../../src/converter/index.js';
import { assertEqual } from '../../support/assertions.js';

async function main(): Promise<void> {
  const entries = [0, 7, -1];
  const binary = await convertSelector(entries);
  await validateBinary(binary);
  const artifact = decodeBinaryArtifactFile(binary);
  const [section] = artifact.sections;

  assertEqual(artifact.kind, BinaryArtifactFileKind.ProverSelector, 'selector artifact kind');
  assertEqual(section.label, 'selector.entries', 'selector section label');
  assertEqual(section.type, BinarySectionType.Placement, 'selector section type');
  assertEqual(section.encoding, BinarySectionEncoding.Bytes, 'selector section encoding');
  assertEqual(section.elementCount, entries.length, 'selector element count');
  assertEqual(section.elementByteLength, 4, 'selector element width');
  const view = new DataView(section.data.buffer, section.data.byteOffset, section.data.byteLength);
  for (const [index, entry] of entries.entries()) {
    assertEqual(view.getInt32(index * 4, true), entry, `selector entry ${index}`);
  }

  assertEqual(view.getUint32(8, true), 0xffff_ffff, 'inactive all-ones bytes');
  await assertRejects(() => convertSelector([0, -2]), 'invalid negative selector entry');
  await assertRejects(() => convertSelector([0, 0xffff_ffff]), 'obsolete unsigned JSON sentinel');
  await assertRejects(() => convertSelector([0, 1.5]), 'fractional selector entry');
  console.log('Checked selector conversion and structural admission');
}

async function assertRejects(action: () => Promise<unknown>, label: string): Promise<void> {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(`Expected ${label} to be rejected.`);
}

await main();
