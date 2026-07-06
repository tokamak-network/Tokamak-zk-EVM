import type { BinarySectionView } from "../serialization/binary-format.js";
import { requireRuntimeSection } from "./loaders.js";
import type { RuntimeArtifactFormatSpec, RuntimeArtifactSectionSpec } from "./specs/types.js";
import type { RuntimeArtifactFile } from "./types.js";

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
  artifactFile: RuntimeArtifactFile,
  spec: RuntimeArtifactFormatSpec,
): LoadedRuntimeArtifactSpec {
  const sections = spec.sections.map((sectionSpec) => loadRuntimeArtifactSection(artifactFile, spec.name, sectionSpec));
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
  artifactFile: RuntimeArtifactFile,
  specName: string,
  spec: RuntimeArtifactSectionSpec,
): LoadedRuntimeArtifactSection {
  const section = requireRuntimeSection(artifactFile, {
    type: spec.type,
    encoding: spec.encoding,
    label: spec.label,
  });

  if (spec.elementCount !== null && section.elementCount !== spec.elementCount) {
    throw new Error(
      `${specName} section '${spec.label}' element count mismatch: expected ${spec.elementCount}, got ${section.elementCount}.`,
    );
  }

  if (spec.elementByteLength !== null && section.elementByteLength !== spec.elementByteLength) {
    throw new Error(
      `${specName} section '${spec.label}' element byte length mismatch: expected ${spec.elementByteLength}, got ${section.elementByteLength}.`,
    );
  }

  const seenIndexes = new Set<number>();
  const points = spec.points.map((point): LoadedRuntimeArtifactPoint => {
    if (point.index >= section.elementCount) {
      throw new Error(`${specName} point '${point.name}' index is outside section '${spec.label}'.`);
    }

    if (seenIndexes.has(point.index)) {
      throw new Error(`Duplicate ${specName} point index ${point.index} in section '${spec.label}'.`);
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
