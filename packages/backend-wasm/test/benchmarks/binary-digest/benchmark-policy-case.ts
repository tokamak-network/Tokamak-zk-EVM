import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import {
  parseDigestPolicy,
  runDigestPolicy,
} from "./digest-policy-candidates.js";

async function main(): Promise<void> {
  const policy = parseDigestPolicy(process.argv[2]);
  const sourcePath = process.argv[3];
  const artifactPath = process.argv[4];
  if (sourcePath === undefined || artifactPath === undefined) {
    throw new Error(
      "Usage: benchmark-policy-case <policy> <combined_sigma.rkyv> <prover-crs.bin>",
    );
  }

  const [source, artifact] = await Promise.all([
    readFile(sourcePath).then((bytes) => new Uint8Array(bytes)),
    readFile(artifactPath).then((bytes) => new Uint8Array(bytes)),
  ]);
  const startedAt = performance.now();
  const result = await runDigestPolicy(policy, source, artifact);
  const elapsedMs = performance.now() - startedAt;
  console.log(JSON.stringify({
    policy,
    elapsedMs,
    sourceBytes: source.byteLength,
    artifactBytes: artifact.byteLength,
    ...result,
  }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
