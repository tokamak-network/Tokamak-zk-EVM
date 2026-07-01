import { decodeBinaryArtifactFile } from "../serialization/binary-artifact-file.js";
import type { BinarySectionView } from "../serialization/binary-format.js";
import type { RuntimeArtifactFile, RuntimeArtifactSectionQuery } from "./types.js";

export type BinaryArtifactLoader = (bytes: Uint8Array) => Promise<RuntimeArtifactFile>;

export const loadRuntimeArtifactFile: BinaryArtifactLoader = async (bytes) => {
  return decodeBinaryArtifactFile(bytes);
};

export function findRuntimeSection(
  artifactFile: RuntimeArtifactFile,
  query: RuntimeArtifactSectionQuery,
): BinarySectionView | undefined {
  return artifactFile.sections.find((section) => {
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
  artifactFile: RuntimeArtifactFile,
  query: RuntimeArtifactSectionQuery,
): BinarySectionView {
  const section = findRuntimeSection(artifactFile, query);

  if (section === undefined) {
    throw new Error(`Missing runtime artifact section: ${JSON.stringify(query)}.`);
  }

  return section;
}
