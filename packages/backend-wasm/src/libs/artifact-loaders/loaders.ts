import type { ArtifactJson } from "./types.js";

export type ArtifactLoader = (path: string) => Promise<ArtifactJson>;
