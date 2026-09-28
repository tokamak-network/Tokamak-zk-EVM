import { createBinaryArtifactFile } from '../../artifacts/binary/binary-artifact-file.js';
import { PROVER_SELECTOR_V1_SPEC } from '../../generated/browser-artifact-contracts.generated.js';
import { BACKEND_WASM_PACKAGE_VERSION } from '../../version.js';

const [selectorEntriesSectionSpec] = PROVER_SELECTOR_V1_SPEC.sections;

export async function convertSelector(selector: unknown): Promise<Uint8Array> {
  const entries = parseSelectorJson(selector);
  const data = new Uint8Array(entries.length * 4);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (const [index, entry] of entries.entries()) {
    view.setInt32(index * 4, entry, true);
  }

  return createBinaryArtifactFile({
    kind: PROVER_SELECTOR_V1_SPEC.kind,
    sourcePackageVersion: BACKEND_WASM_PACKAGE_VERSION,
    sections: [{
      ...selectorEntriesSectionSpec,
      elementCount: entries.length,
      elementByteLength: 4,
      data,
    }],
  });
}

function parseSelectorJson(raw: unknown): readonly number[] {
  if (!Array.isArray(raw)) {
    throw new Error('Native selector JSON must be an array.');
  }
  return raw.map((entry, index) => {
    if (!Number.isSafeInteger(entry) || entry < -1 || entry > 0x7fff_ffff) {
      throw new Error(`selector[${index}] must be -1 or a non-negative signed 32-bit subcircuit ID.`);
    }
    return entry as number;
  });
}
