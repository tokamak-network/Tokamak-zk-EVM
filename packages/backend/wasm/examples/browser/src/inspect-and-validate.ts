import {
  inspectBinary,
  validateBinary,
  type BinaryArtifactInspection,
} from "@tokamak-zk-evm/snark-browser-compat/converter";

export async function inspectAndValidate(
  artifact: Uint8Array,
): Promise<BinaryArtifactInspection> {
  const inspection = await inspectBinary(artifact);
  await validateBinary(artifact);
  return inspection;
}
