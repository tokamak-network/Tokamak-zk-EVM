import type { BinarySectionView } from "../serialization/binary-format.js";
import { requireRuntimeSection } from "./loaders.js";
import { SIGMA_VERIFY_V1_SPEC } from "./specs/sigma-verify.v1.generated.js";
import type { SigmaVerifySectionSpec } from "./specs/types.js";
import type { RuntimeArtifactFile } from "./types.js";

export interface SigmaVerifyArtifact {
  readonly sections: readonly SigmaVerifyLoadedSection[];
  readonly pointsByName: Readonly<Record<string, Uint8Array>>;
}

export interface SigmaVerifyLoadedSection {
  readonly spec: SigmaVerifySectionSpec;
  readonly section: BinarySectionView;
  readonly points: readonly SigmaVerifyLoadedPoint[];
}

export interface SigmaVerifyLoadedPoint {
  readonly name: string;
  readonly index: number;
  readonly data: Uint8Array;
}

export function loadSigmaVerifyArtifact(artifactFile: RuntimeArtifactFile): SigmaVerifyArtifact {
  const sections = SIGMA_VERIFY_V1_SPEC.sections.map((sectionSpec) =>
    loadSigmaVerifySection(artifactFile, sectionSpec),
  );
  const pointsByName: Record<string, Uint8Array> = {};

  for (const section of sections) {
    for (const point of section.points) {
      if (pointsByName[point.name] !== undefined) {
        throw new Error(`Duplicate sigma_verify point name in generated spec: ${point.name}.`);
      }

      pointsByName[point.name] = point.data;
    }
  }

  return {
    sections,
    pointsByName,
  };
}

function loadSigmaVerifySection(
  artifactFile: RuntimeArtifactFile,
  spec: SigmaVerifySectionSpec,
): SigmaVerifyLoadedSection {
  const section = requireRuntimeSection(artifactFile, {
    type: spec.type,
    encoding: spec.encoding,
    label: spec.label,
  });

  if (section.elementCount !== spec.elementCount) {
    throw new Error(
      `sigma_verify section '${spec.label}' element count mismatch: expected ${spec.elementCount}, got ${section.elementCount}.`,
    );
  }

  const seenIndexes = new Set<number>();
  const points = spec.points.map((point): SigmaVerifyLoadedPoint => {
    if (point.index >= section.elementCount) {
      throw new Error(`sigma_verify point '${point.name}' index is outside section '${spec.label}'.`);
    }

    if (seenIndexes.has(point.index)) {
      throw new Error(`Duplicate sigma_verify point index ${point.index} in section '${spec.label}'.`);
    }

    seenIndexes.add(point.index);
    const start = point.index * section.elementByteLength;
    const end = start + section.elementByteLength;

    return {
      name: point.name,
      index: point.index,
      data: section.data.subarray(start, end),
    };
  });

  return {
    spec,
    section,
    points,
  };
}
