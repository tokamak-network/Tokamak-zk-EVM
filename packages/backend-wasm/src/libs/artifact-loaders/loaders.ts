import { decodeBinaryBundle } from "../serialization/binary-bundle.js";
import type { BinarySectionView } from "../serialization/binary-format.js";
import type { RuntimeArtifactBundle, RuntimeArtifactSectionQuery } from "./types.js";

export type BinaryArtifactLoader = (bytes: Uint8Array) => Promise<RuntimeArtifactBundle>;

export const loadRuntimeArtifactBundle: BinaryArtifactLoader = async (bytes) => {
  return decodeBinaryBundle(bytes);
};

export function findRuntimeSection(
  bundle: RuntimeArtifactBundle,
  query: RuntimeArtifactSectionQuery,
): BinarySectionView | undefined {
  return bundle.sections.find((section) => {
    if (section.type !== query.type) {
      return false;
    }

    if (query.encoding !== undefined && section.encoding !== query.encoding) {
      return false;
    }

    if (query.label !== undefined && section.label !== query.label) {
      return false;
    }

    return true;
  });
}

export function requireRuntimeSection(
  bundle: RuntimeArtifactBundle,
  query: RuntimeArtifactSectionQuery,
): BinarySectionView {
  const section = findRuntimeSection(bundle, query);

  if (section === undefined) {
    throw new Error(`Missing runtime artifact section: ${JSON.stringify(query)}.`);
  }

  return section;
}
