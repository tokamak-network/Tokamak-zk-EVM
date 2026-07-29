import { requireBinaryArtifactSection } from "../binary/binary-artifact-file.js";
import type { BinaryArtifactFileView } from "../binary/binary-format.js";
import type { RuntimeArtifactFormatSpec } from "./types.js";

export function loadNamedArtifactPoints(
  artifactFile: BinaryArtifactFileView,
  spec: RuntimeArtifactFormatSpec,
): Readonly<Record<string, Uint8Array>> {
  const points: Record<string, Uint8Array> = {};

  for (const sectionSpec of spec.sections) {
    const section = requireBinaryArtifactSection(artifactFile, sectionSpec);
    for (const point of sectionSpec.points) {
      const start = point.index * section.elementByteLength;
      const end = start + section.elementByteLength;
      if (point.index >= section.elementCount || end > section.data.byteLength) {
        throw new Error(
          `${spec.name} point '${point.name}' is outside section '${sectionSpec.label}'.`,
        );
      }
      points[point.name] = section.data.subarray(start, end);
    }
  }

  return points;
}
