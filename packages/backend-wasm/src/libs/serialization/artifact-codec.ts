import type { ArtifactJson } from "../artifact-loaders/types.js";

export interface ArtifactCodec {
  parse(value: unknown): ArtifactJson;
}
