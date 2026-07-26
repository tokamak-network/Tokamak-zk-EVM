import type { BinarySectionView } from "../binary/binary-format.js";
import { requireBinaryArtifactSection } from "../binary/binary-artifact-file.js";
import type { BinaryArtifactFileView } from "../binary/binary-format.js";
import type { RuntimeArtifactFormatSpec, RuntimeArtifactSectionSpec } from "./types.js";

export interface LoadedRuntimeArtifactSpec {
  readonly spec: RuntimeArtifactFormatSpec;
  readonly sections: readonly LoadedRuntimeArtifactSection[];
  readonly pointsByName: Readonly<Record<string, Uint8Array>>;
}

export interface LoadedRuntimeArtifactSection {
  readonly spec: RuntimeArtifactSectionSpec;
  readonly section: BinarySectionView;
  readonly points: readonly LoadedRuntimeArtifactPoint[];
}

export interface LoadedRuntimeArtifactPoint {
  readonly name: string;
  readonly index: number;
  readonly data: Uint8Array;
}

export function loadRuntimeArtifactBySpec(
  artifactFile: BinaryArtifactFileView,
  spec: RuntimeArtifactFormatSpec,
): LoadedRuntimeArtifactSpec {
  const sections = spec.sections.map((sectionSpec) => loadRuntimeArtifactSection(artifactFile, sectionSpec));
  const pointsByName: Record<string, Uint8Array> = {};

  for (const section of sections) {
    for (const point of section.points) {
      if (pointsByName[point.name] !== undefined) {
        throw new Error(`Duplicate point name in ${spec.name} generated spec: ${point.name}.`);
      }

      pointsByName[point.name] = point.data;
    }
  }

  return {
    spec,
    sections,
    pointsByName,
  };
}

function loadRuntimeArtifactSection(
  artifactFile: BinaryArtifactFileView,
  spec: RuntimeArtifactSectionSpec,
): LoadedRuntimeArtifactSection {
  const section = requireBinaryArtifactSection(artifactFile, {
    type: spec.type,
    encoding: spec.encoding,
    label: spec.label,
  });

  const seenIndexes = new Set<number>();
  const points = spec.points.map((point): LoadedRuntimeArtifactPoint => {
    if (seenIndexes.has(point.index)) {
      throw new Error(`Duplicate point index ${point.index} in generated section spec '${spec.label}'.`);
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
