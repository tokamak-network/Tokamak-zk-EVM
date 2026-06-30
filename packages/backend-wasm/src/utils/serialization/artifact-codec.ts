import type { ArtifactJson } from "../../libs/artifact-loaders/types.js";

export interface ArtifactCodec {
  parse(value: unknown): ArtifactJson;
}
